import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashAnonymousOwnershipToken } from "@/application/ownership";
import {
  claimFixtureMenu,
  createFixtureDraft,
  getFixtureGenerationView,
  getOwnedFixtureMenu,
  regenerateFixtureItem,
  releaseFixtureGenerationReservation,
  reserveAndStartFixtureGeneration,
  reviseFixtureMenu,
  runFixtureGeneration,
  transitionFixtureMenu,
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

  it("claims an anonymous draft once and invalidates the old owner", () => {
    const menuId = randomUUID();
    const userId = randomUUID();
    createFixtureDraft({
      menuId,
      anonymousTokenHash: hashAnonymousOwnershipToken("claim-token"),
      targetLanguage: "en",
      now: "2026-09-22T00:00:00.000Z",
    });

    expect(
      claimFixtureMenu({
        menuId,
        anonymousToken: "claim-token",
        userId,
        now: "2026-09-22T00:01:00.000Z",
      }),
    ).toBe(true);
    expect(
      claimFixtureMenu({
        menuId,
        anonymousToken: "claim-token",
        userId: randomUUID(),
        now: "2026-09-22T00:02:00.000Z",
      }),
    ).toBe(false);
    expect(
      getOwnedFixtureMenu({
        menuId,
        anonymousToken: "claim-token",
        userId: null,
      }),
    ).toBeNull();
    expect(
      getOwnedFixtureMenu({ menuId, anonymousToken: null, userId })?.id,
    ).toBe(menuId);
  });

  it("reserves once, consumes at the first request, and isolates item failure", async () => {
    const { menuId, userId } = createClaimedGenerationReadyDraft();

    const first = reserveAndStartFixtureGeneration({
      menuId,
      userId,
      now: "2026-09-22T00:02:00.000Z",
    });
    const duplicate = reserveAndStartFixtureGeneration({
      menuId,
      userId,
      now: "2026-09-22T00:02:01.000Z",
    });
    expect(duplicate.reservationId).toBe(first.reservationId);
    expect(
      getFixtureGenerationView({
        menuId,
        anonymousToken: null,
        userId,
        now: new Date("2026-09-22T00:02:02.000Z"),
      })?.quota,
    ).toMatchObject({ consumed: 0, reserved: 1, remaining: 2 });

    await Promise.all([
      runFixtureGeneration(menuId, { delayMs: 0 }),
      runFixtureGeneration(menuId, { delayMs: 0 }),
    ]);

    const completed = getFixtureGenerationView({
      menuId,
      anonymousToken: null,
      userId,
      now: new Date(),
    });
    expect(completed?.menu.state).toBe("ready");
    expect(completed?.quota).toMatchObject({
      consumed: 1,
      reserved: 0,
      remaining: 2,
    });
    expect(completed?.estimatedCostUsd).toBe(0.04);
    expect(completed?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          itemId: "mackerel",
          state: "source_photo_ready",
          provenance: "source",
        }),
        expect.objectContaining({
          itemId: "tea",
          state: "failed",
          sanitizedErrorCode: "provider_content_rejected",
        }),
        expect.objectContaining({ itemId: "udon", state: "generated" }),
      ]),
    );
  });

  it("allows two uploader regenerations without another menu credit", async () => {
    const { menuId, userId } = createClaimedGenerationReadyDraft();
    reserveAndStartFixtureGeneration({
      menuId,
      userId,
      now: "2026-09-22T00:02:00.000Z",
    });
    await runFixtureGeneration(menuId, { delayMs: 0 });

    regenerateFixtureItem({
      menuId,
      itemId: "tea",
      userId,
      now: "2026-09-22T00:03:00.000Z",
    });
    regenerateFixtureItem({
      menuId,
      itemId: "tea",
      userId,
      now: "2026-09-22T00:04:00.000Z",
    });
    expect(() =>
      regenerateFixtureItem({
        menuId,
        itemId: "tea",
        userId,
        now: "2026-09-22T00:05:00.000Z",
      }),
    ).toThrow("regeneration_limit_reached");
    expect(
      getFixtureGenerationView({ menuId, anonymousToken: null, userId })?.quota
        ?.consumed,
    ).toBe(1);
  });

  it("releases a reservation when no provider request starts", () => {
    const { menuId, userId } = createClaimedGenerationReadyDraft();
    reserveAndStartFixtureGeneration({
      menuId,
      userId,
      now: "2026-09-22T00:02:00.000Z",
    });

    expect(
      releaseFixtureGenerationReservation({
        menuId,
        userId,
        now: "2026-09-22T00:03:00.000Z",
        reasonCode: "workflow_start_failed",
      }),
    ).toBe(true);
    const released = getFixtureGenerationView({
      menuId,
      anonymousToken: null,
      userId,
    });
    expect(released?.menu.state).toBe("failed");
    expect(released?.quota).toMatchObject({
      consumed: 0,
      reserved: 0,
      remaining: 3,
    });
  });
});

function createClaimedGenerationReadyDraft() {
  const menuId = randomUUID();
  const userId = randomUUID();
  const token = randomUUID();
  createFixtureDraft({
    menuId,
    anonymousTokenHash: hashAnonymousOwnershipToken(token),
    targetLanguage: "en",
    now: "2026-09-22T00:00:00.000Z",
  });
  claimFixtureMenu({
    menuId,
    anonymousToken: token,
    userId,
    now: "2026-09-22T00:01:00.000Z",
  });
  transitionFixtureMenu({
    menuId,
    anonymousToken: null,
    userId,
    expected: "review_ready",
    next: "generation_ready",
    now: "2026-09-22T00:01:30.000Z",
  });
  return { menuId, userId };
}
