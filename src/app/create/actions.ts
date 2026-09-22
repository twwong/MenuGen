"use server";

import { randomUUID } from "node:crypto";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { start } from "workflow/api";
import { z } from "zod";

import {
  FIXTURE_USER_COOKIE,
  fixtureUserCookieOptions,
  getFixtureCreatorActor,
  getCreatorActor,
  getManagedCreatorActor,
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
import { NeonCreatorRepository } from "@/infrastructure/db/creator-repository";
import { NeonGenerationRepository } from "@/infrastructure/db/generation-repository";
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
import {
  completeSourcePhotoOnlyWorkflow,
  generateMenuWorkflow,
  regenerateItemWorkflow,
} from "@/workflows/generate-menu";
import { deleteResultWorkflow } from "@/workflows/lifecycle";
import { TransloaditUploadScanner } from "@/providers/transloadit/transloadit-upload-scanner";
import { UpstashAnonymousRateLimiter } from "@/providers/upstash/upstash-rate-limiter";

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

export async function beginManagedUploadAction(input: unknown) {
  const environment = readCreatorEnvironment();
  if (
    environment.CREATOR_WORKFLOW_ENABLED !== "true" ||
    environment.CREATOR_BACKEND !== "managed"
  ) {
    throw new Error("managed_creator_unavailable");
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
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  const limiter = new UpstashAnonymousRateLimiter({
    url: required(environment.UPSTASH_REDIS_REST_URL, "upstash_url_missing"),
    token: required(
      environment.UPSTASH_REDIS_REST_TOKEN,
      "upstash_token_missing",
    ),
  });
  const limits = await limiter.checkAnonymousExtraction({
    ipAddress,
    deviceToken,
  });
  if (!limits.ip.allowed || !limits.device.allowed) {
    throw new Error("anonymous_rate_limit");
  }

  const menuId = randomUUID();
  const ownershipToken = createAnonymousOwnershipToken();
  await new NeonCreatorRepository().createAnonymousMenu({
    menuId,
    anonymousTokenHash: hashAnonymousOwnershipToken(ownershipToken),
    targetLanguage: parsed.targetLanguage,
  });
  const notifyUrl = new URL(
    "/api/creator/uploads/transloadit",
    required(process.env.NEXT_PUBLIC_APP_URL, "app_url_missing"),
  ).toString();
  const upload = await new TransloaditUploadScanner(
    required(environment.TRANSLOADIT_KEY, "transloadit_key_missing"),
    required(environment.TRANSLOADIT_SECRET, "transloadit_secret_missing"),
    notifyUrl,
  ).createSignedUpload({ menuId, sourceCount: parsed.files.length });
  cookieStore.set(
    ANONYMOUS_DRAFT_COOKIE,
    ownershipToken,
    anonymousOwnershipCookieOptions(),
  );
  return { menuId, params: upload.params, signature: upload.signature };
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
  const actor = await getCreatorActor();
  const correctedAt = new Date().toISOString();
  const patch = {
    ...parsed.patch,
    correctedAt,
    actor: actor.userId ? ("user" as const) : ("anonymous_owner" as const),
    actorId: actor.userId,
  };
  const resolutions = [
    {
      issueId: parsed.issueId,
      status: parsed.acceptUncertainty
        ? ("accepted_uncertainty" as const)
        : ("resolved" as const),
      resolvedAt: correctedAt,
      correctionId: patch.correctionId,
    },
  ];
  const revision =
    readCreatorEnvironment().CREATOR_BACKEND === "managed"
      ? await new NeonCreatorRepository().appendRevision({
          menuId: parsed.menuId,
          actor,
          previousRevisionId: parsed.previousRevisionId,
          patches: [patch],
          resolutions,
        })
      : reviseFixtureMenu({
          menuId: parsed.menuId,
          ...actor,
          previousRevisionId: parsed.previousRevisionId,
          patches: [patch],
          resolutions,
          now: correctedAt,
        });
  revalidatePath(`/create/${parsed.menuId}/review`);
  return revision;
}

export async function completeReviewAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const actor = await getCreatorActor();
  const environment = readCreatorEnvironment();
  const menu =
    environment.CREATOR_BACKEND === "managed"
      ? await new NeonCreatorRepository().getOwnedMenu(menuId, actor)
      : getOwnedFixtureMenu({ menuId, ...actor });
  if (!menu?.currentRevision) throw new Error("menu_not_found");
  if (collectReviewIssues(menu.currentRevision).length > 0) {
    throw new Error("review_issues_remain");
  }
  const transitioned =
    environment.CREATOR_BACKEND === "managed"
      ? await new NeonCreatorRepository().transitionMenu({
          menuId,
          actor,
          expectedState: "review_ready",
          nextState: "generation_ready",
        })
      : transitionFixtureMenu({
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

export async function claimManagedDraftAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const environment = readCreatorEnvironment();
  if (environment.CREATOR_BACKEND !== "managed") {
    throw new Error("managed_claim_unavailable");
  }
  const actor = await getManagedCreatorActor();
  if (!actor.userId) redirect(`/sign-in?returnTo=/create/${menuId}/claim`);
  if (!actor.anonymousToken) throw new Error("anonymous_ownership_missing");
  const claimed = await new NeonCreatorRepository().claimAnonymousMenu({
    menuId,
    anonymousTokenHash: hashAnonymousOwnershipToken(actor.anonymousToken),
    userId: actor.userId,
  });
  if (!claimed) throw new Error("draft_claim_conflict");
  const cookieStore = await cookies();
  cookieStore.delete(ANONYMOUS_DRAFT_COOKIE);
  redirect(`/create/${menuId}/generate`);
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

export async function confirmManagedGenerationAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const actor = await getManagedCreatorActor();
  if (!actor.userId) throw new Error("authentication_required");
  const repository = new NeonGenerationRepository();
  const reservation = await repository.reserveMenuCredit({
    menuId,
    userId: actor.userId,
    now: new Date(),
  });
  if (reservation.sourcePhotoOnly) {
    const claimedStart = await repository.claimGenerationWorkflowStart(menuId);
    if (!claimedStart) return reservation;
    let run;
    try {
      run = await start(completeSourcePhotoOnlyWorkflow, [
        menuId,
        actor.userId,
      ]);
    } catch {
      await repository.releaseGenerationWorkflowClaim(menuId, new Date());
      throw new Error("source_photo_completion_start_failed");
    }
    await repository.recordWorkflowRun({
      menuId,
      userId: actor.userId,
      runId: run.runId,
    });
    revalidatePath(`/create/${menuId}/result`);
    return reservation;
  }
  const claimedStart = await repository.claimGenerationWorkflowStart(menuId);
  if (!claimedStart) return reservation;
  let run;
  try {
    run = await start(generateMenuWorkflow, [menuId]);
  } catch {
    await repository.releaseReservationIfNoRequest({
      menuId,
      userId: actor.userId,
      reasonCode: "workflow_start_failed",
      now: new Date(),
    });
    throw new Error("generation_workflow_start_failed");
  }
  await repository.recordWorkflowRun({
    menuId,
    userId: actor.userId,
    runId: run.runId,
  });
  return { ...reservation, runId: run.runId };
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

export async function regenerateManagedItemAction(input: unknown) {
  const parsed = z
    .object({ menuId: z.string().uuid(), itemId: z.string().uuid() })
    .strict()
    .parse(input);
  await assertSameOrigin();
  const actor = await getManagedCreatorActor();
  if (!actor.userId) throw new Error("authentication_required");
  const repository = new NeonGenerationRepository();
  const reserved = await repository.reserveRegeneration({
    menuId: parsed.menuId,
    itemPublicId: parsed.itemId,
    userId: actor.userId,
    now: new Date(),
  });
  let run;
  try {
    run = await start(regenerateItemWorkflow, [
      parsed.menuId,
      reserved.revisionId,
      reserved.internalItemId,
      reserved.regenerationSequence,
    ]);
  } catch {
    await repository.releaseRegenerationStart({
      menuId: parsed.menuId,
      itemId: reserved.internalItemId,
      itemPublicId: parsed.itemId,
      regenerationSequence: reserved.regenerationSequence,
      previousState: reserved.previousState,
      now: new Date(),
    });
    throw new Error("regeneration_workflow_start_failed");
  }
  await repository.recordRegenerationRun({
    menuId: parsed.menuId,
    itemPublicId: parsed.itemId,
    regenerationSequence: reserved.regenerationSequence,
    runId: run.runId,
  });
  revalidatePath(`/create/${parsed.menuId}/generate`);
  return { runId: run.runId };
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

export async function deleteManagedMenuAction(menuId: string) {
  z.string().uuid().parse(menuId);
  await assertSameOrigin();
  const actor = await getManagedCreatorActor();
  if (!actor.userId) throw new Error("authentication_required");
  const run = await start(deleteResultWorkflow, [
    menuId,
    actor.userId,
    "user_request",
  ]);
  revalidatePath("/create/dashboard");
  return { menuId, runId: run.runId };
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

function required(value: string | undefined, code: string) {
  if (!value) throw new Error(code);
  return value;
}
