"use server";

import { randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  FIXTURE_USER_COOKIE,
  fixtureUserCookieOptions,
  getFixtureCreatorActor,
} from "@/app/create/session";
import {
  ANONYMOUS_DRAFT_COOKIE,
  anonymousOwnershipCookieOptions,
  createAnonymousOwnershipToken,
  hashAnonymousOwnershipToken,
} from "@/application/ownership";
import { collectReviewIssues } from "@/application/review-issues";
import { readCreatorEnvironment } from "@/config/env";
import { reviewPatchSchema } from "@/domain/creator/revisions";
import { targetLanguageSchema } from "@/domain/menu/menu-extraction";
import {
  claimFixtureMenu,
  createFixtureDraft,
  deleteFixtureMenu,
  getOwnedFixtureMenu,
  regenerateFixtureItem,
  reserveAndStartFixtureGeneration,
  reviseFixtureMenu,
  runFixtureGeneration,
  transitionFixtureMenu,
} from "@/providers/fixture/fixture-creator-store";

const DEVICE_COOKIE = "menugen_device";
const DAY_MS = 24 * 60 * 60 * 1000;

const uploadInputSchema = z
  .object({
    targetLanguage: targetLanguageSchema,
    files: z
      .array(
        z
          .object({
            name: z.string().min(1).max(255),
            size: z
              .number()
              .int()
              .positive()
              .max(20 * 1024 * 1024),
            type: z.enum([
              "application/pdf",
              "image/jpeg",
              "image/png",
              "image/heic",
              "image/heif",
            ]),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((input, context) => {
    if (
      input.files.reduce((total, file) => total + file.size, 0) >
      50 * 1024 * 1024
    ) {
      context.addIssue({
        code: "custom",
        message: "The menu exceeds the 50 MB total limit",
        path: ["files"],
      });
    }
    const pdfCount = input.files.filter(
      (file) => file.type === "application/pdf",
    ).length;
    if (pdfCount > 0 && (pdfCount !== 1 || input.files.length !== 1)) {
      context.addIssue({
        code: "custom",
        message: "Choose one PDF or an ordered set of photos",
        path: ["files"],
      });
    }
  });

const fixtureLimits = ((
  globalThis as typeof globalThis & {
    __menugenFixtureLimits?: Map<string, number[]>;
  }
).__menugenFixtureLimits ??= new Map<string, number[]>());

export async function createDraftAction(input: unknown) {
  const environment = readCreatorEnvironment();
  if (environment.CREATOR_WORKFLOW_ENABLED !== "true") {
    throw new Error("creator_workflow_disabled");
  }
  if (environment.CREATOR_BACKEND !== "fixture") {
    throw new Error("managed_upload_requires_signed_transloadit_flow");
  }
  await assertSameOrigin();
  const parsed = uploadInputSchema.parse(input);
  const requestHeaders = await headers();
  const cookieStore = await cookies();
  const ipAddress =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  let deviceToken = cookieStore.get(DEVICE_COOKIE)?.value;
  if (!deviceToken) {
    deviceToken = randomUUID();
    cookieStore.set(DEVICE_COOKIE, deviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  enforceFixtureLimit(`ip:${ipAddress}`);
  enforceFixtureLimit(`device:${deviceToken}`);

  const ownershipToken = createAnonymousOwnershipToken();
  const menuId = randomUUID();
  createFixtureDraft({
    menuId,
    anonymousTokenHash: hashAnonymousOwnershipToken(ownershipToken),
    targetLanguage: parsed.targetLanguage,
    now: new Date().toISOString(),
  });
  cookieStore.set(
    ANONYMOUS_DRAFT_COOKIE,
    ownershipToken,
    anonymousOwnershipCookieOptions(),
  );
  return { menuId };
}

export async function resolveReviewIssueAction(input: unknown) {
  const parsed = z
    .object({
      menuId: z.string().uuid(),
      previousRevisionId: z.string().uuid(),
      issueId: z.string().min(1),
      patch: reviewPatchSchema,
      acceptUncertainty: z.boolean().default(false),
    })
    .strict()
    .parse(input);
  await assertSameOrigin();
  const actor = await fixtureActor();
  const correctedAt = new Date().toISOString();
  const patch = {
    ...parsed.patch,
    correctedAt,
    actor: actor.userId ? ("user" as const) : ("anonymous_owner" as const),
    actorId: actor.userId,
  };
  const revision = reviseFixtureMenu({
    menuId: parsed.menuId,
    ...actor,
    previousRevisionId: parsed.previousRevisionId,
    patches: [patch],
    resolutions: [
      {
        issueId: parsed.issueId,
        status: parsed.acceptUncertainty ? "accepted_uncertainty" : "resolved",
        resolvedAt: correctedAt,
        correctionId: patch.correctionId,
      },
    ],
    now: correctedAt,
  });
  revalidatePath(`/create/${parsed.menuId}/review`);
  return revision;
}

export async function completeReviewAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const actor = await fixtureActor();
  const menu = getOwnedFixtureMenu({ menuId, ...actor });
  if (!menu?.currentRevision) throw new Error("menu_not_found");
  if (collectReviewIssues(menu.currentRevision).length > 0) {
    throw new Error("review_issues_remain");
  }
  const transitioned = transitionFixtureMenu({
    menuId,
    ...actor,
    expected: "review_ready",
    next: "generation_ready",
    now: new Date().toISOString(),
  });
  if (!transitioned) throw new Error("menu_state_conflict");
  return { menuId };
}

export async function claimFixtureDraftAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const environment = readCreatorEnvironment();
  if (environment.CREATOR_BACKEND !== "fixture") {
    throw new Error("fixture_claim_unavailable");
  }
  const cookieStore = await cookies();
  const anonymousToken = cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value;
  if (!anonymousToken) throw new Error("anonymous_ownership_missing");
  const existingUserId = cookieStore.get(FIXTURE_USER_COOKIE)?.value;
  const userId = existingUserId ?? randomUUID();
  const claimed = claimFixtureMenu({
    menuId,
    anonymousToken,
    userId,
    now: new Date().toISOString(),
  });
  if (!claimed) throw new Error("draft_claim_conflict");
  cookieStore.set(FIXTURE_USER_COOKIE, userId, fixtureUserCookieOptions());
  cookieStore.delete(ANONYMOUS_DRAFT_COOKIE);
  revalidatePath(`/create/${menuId}/generate`);
  return { menuId };
}

export async function confirmFixtureGenerationAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const actor = await fixtureActor();
  if (!actor.userId) throw new Error("authentication_required");
  const generation = reserveAndStartFixtureGeneration({
    menuId,
    userId: actor.userId,
    now: new Date().toISOString(),
  });
  void runFixtureGeneration(menuId);
  revalidatePath(`/create/${menuId}/generate`);
  return generation;
}

export async function regenerateFixtureItemAction(input: unknown) {
  const parsed = z
    .object({ menuId: z.string().uuid(), itemId: z.string().min(1).max(100) })
    .strict()
    .parse(input);
  await assertSameOrigin();
  const actor = await fixtureActor();
  if (!actor.userId) throw new Error("authentication_required");
  regenerateFixtureItem({
    ...parsed,
    userId: actor.userId,
    now: new Date().toISOString(),
  });
  revalidatePath(`/create/${parsed.menuId}/generate`);
}

export async function deleteFixtureMenuAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const actor = await fixtureActor();
  if (!actor.userId) throw new Error("authentication_required");
  deleteFixtureMenu({
    menuId,
    userId: actor.userId,
    now: new Date().toISOString(),
    reason: "user_request",
  });
  revalidatePath("/create/dashboard");
  return { menuId };
}

export async function getFixtureActor() {
  return fixtureActor();
}

async function fixtureActor() {
  return getFixtureCreatorActor();
}

async function assertSameOrigin() {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new Error("origin_mismatch");
  }
}

function enforceFixtureLimit(key: string) {
  const now = Date.now();
  const recent = (fixtureLimits.get(key) ?? []).filter(
    (time) => now - time < DAY_MS,
  );
  if (recent.length >= 3) throw new Error("anonymous_rate_limit");
  recent.push(now);
  fixtureLimits.set(key, recent);
}
