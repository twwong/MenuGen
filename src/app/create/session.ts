import "server-only";

import { cookies } from "next/headers";

import { ANONYMOUS_DRAFT_COOKIE } from "@/application/ownership";
import type { ActorContext } from "@/application/contracts";
import { readCreatorEnvironment } from "@/config/env";
import { ensureCreatorUser } from "@/infrastructure/db/creator-repository";
import { ClerkAuthGateway } from "@/providers/clerk/clerk-auth-gateway";

export const FIXTURE_USER_COOKIE = "menugen_fixture_user";

export async function getFixtureCreatorActor(): Promise<ActorContext> {
  const cookieStore = await cookies();
  return {
    anonymousToken: cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value ?? null,
    userId: cookieStore.get(FIXTURE_USER_COOKIE)?.value ?? null,
  };
}

export async function getManagedCreatorActor(): Promise<ActorContext> {
  const cookieStore = await cookies();
  const identity = await new ClerkAuthGateway().getActor();
  const user = identity.clerkUserId
    ? await ensureCreatorUser({
        clerkUserId: identity.clerkUserId,
        email: identity.email,
      })
    : null;
  return {
    anonymousToken: cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value ?? null,
    userId: user?.id ?? null,
  };
}

export async function getCreatorActor(): Promise<ActorContext> {
  return readCreatorEnvironment().CREATOR_BACKEND === "managed"
    ? getManagedCreatorActor()
    : getFixtureCreatorActor();
}

export function fixtureUserCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}
