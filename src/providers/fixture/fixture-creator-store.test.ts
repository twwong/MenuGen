import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashAnonymousOwnershipToken } from "@/application/ownership";
import {
  createFixtureDraft,
  getOwnedFixtureMenu,
  reviseFixtureMenu,
} from "@/providers/fixture/fixture-creator-store";

describe("fixture creator store", () => {
  it("never returns a draft to a different anonymous token", () => {
    const menuId = randomUUID();
    createFixtureDraft({
      menuId,
      anonymousTokenHash: hashAnonymousOwnershipToken("right-token"),
      targetLanguage: "en",
      now: "2026-09-22T00:00:00.000Z",
    });

    expect(
      getOwnedFixtureMenu({
        menuId,
        anonymousToken: "wrong-token",
        userId: null,
      }),
    ).toBeNull();
    expect(
      getOwnedFixtureMenu({
        menuId,
        anonymousToken: "right-token",
        userId: null,
      })?.id,
    ).toBe(menuId);
  });

  it("adds a correction as a new revision without mutating the first snapshot", () => {
    const menuId = randomUUID();
    const token = "revision-token";
    const first = createFixtureDraft({
      menuId,
      anonymousTokenHash: hashAnonymousOwnershipToken(token),
      targetLanguage: "en",
      now: "2026-09-22T00:00:00.000Z",
    }).currentRevision!;

    const correctionId = randomUUID();
    const revised = reviseFixtureMenu({
      menuId,
      anonymousToken: token,
      userId: null,
      previousRevisionId: first.revisionId,
      patches: [
        {
          correctionId,
          correctedAt: "2026-09-22T00:01:00.000Z",
          actor: "anonymous_owner",
          actorId: null,
          reason: "confirmed",
          kind: "field",
          sectionId: "noodles",
          itemId: "udon",
          field: "price",
          value: "¥980",
        },
      ],
      resolutions: [
        {
          issueId: "item:udon:price",
          status: "resolved",
          resolvedAt: "2026-09-22T00:01:00.000Z",
          correctionId,
        },
      ],
      now: "2026-09-22T00:01:00.000Z",
    });

    expect(revised.revisionNumber).toBe(2);
    expect(revised.menu.sections[1]!.items[0]!.price?.sourceText).toBe("¥980");
    expect(first.menu.sections[1]!.items[0]!.price?.sourceText).toBe("¥9?0");
  });
});
