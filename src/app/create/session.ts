import "server-only";

import { cookies } from "next/headers";

import { ANONYMOUS_DRAFT_COOKIE } from "@/application/ownership";
import type { ActorContext } from "@/application/contracts";

export const FIXTURE_USER_COOKIE = "menugen_fixture_user";

export async function getFixtureCreatorActor(): Promise<ActorContext> {
  const cookieStore = await cookies();
  return {
    anonymousToken: cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value ?? null,
    userId: cookieStore.get(FIXTURE_USER_COOKIE)?.value ?? null,
  };
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
