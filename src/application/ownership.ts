import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const ANONYMOUS_DRAFT_COOKIE = "menugen_draft_owner";

export function createAnonymousOwnershipToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAnonymousOwnershipToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function ownershipTokenMatches(
  token: string,
  expectedHash: string,
): boolean {
  const actual = Buffer.from(hashAnonymousOwnershipToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function anonymousOwnershipCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24,
  };
}
