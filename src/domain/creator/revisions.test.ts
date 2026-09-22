import { describe, expect, it } from "vitest";

import {
  createRevisedDraft,
  menuDraftV1Schema,
} from "@/domain/creator/revisions";

const ids = {
  menu: "78b51473-88d8-4c9a-9949-a279ad123876",
  revision: "6679c305-e170-44f4-8461-e64cdd84d521",
  correction: "4b870542-7ddd-4376-9544-4d985099ca3f",
};

function firstRevision() {
  return {
    schemaVersion: "1",
    menuId: ids.menu,
    revisionId: ids.revision,
    revisionNumber: 1,
    basedOnRevisionId: null,
    createdAt: "2026-09-22T00:00:00.000Z",
    menu: {
      schemaVersion: "2",
      sourceLanguage: "ja",
      targetLanguage: "en",
      sections: [
        {
          id: "noodles",
          order: 0,
          title: {
            sourceText: "麺",
            translatedText: "Noodles",
            confidence: 0.99,
            needsReview: false,
          },
          items: [
            {
              id: "udon",
              order: 0,
              name: {
                sourceText: "うどん",
                translatedText: "Udon",
                confidence: 0.99,
                needsReview: false,
              },
              price: {
                sourceText: "¥800",
                confidence: 0.7,
                needsReview: true,
              },
              explicitSourceClaims: [],
              imageEligibility: "prepared_food",
            },
          ],
        },
      ],
      sourcePhotoCandidates: [],
    },
    corrections: [
      {
        correctionId: ids.correction,
        correctedAt: "2026-09-22T00:00:00.000Z",
        actor: "anonymous_owner",
        actorId: null,
        reason: null,
        kind: "field",
        sectionId: "noodles",
        itemId: "udon",
        field: "price",
        value: "¥800",
      },
    ],
    reviewResolutions: [
      {
        issueId: "price:udon",
        status: "resolved",
        resolvedAt: "2026-09-22T00:00:00.000Z",
        correctionId: ids.correction,
      },
    ],
  };
}

describe("menuDraftV1Schema", () => {
  it("wraps schema v2 without changing the provider response schema", () => {
    expect(menuDraftV1Schema.parse(firstRevision()).menu.schemaVersion).toBe(
      "2",
    );
  });

  it("rejects a resolution that points to an unknown correction", () => {
    const draft = firstRevision();
    draft.reviewResolutions[0]!.correctionId =
      "3a9f568d-358b-45ba-bcdb-dbe206942115";

    expect(() => menuDraftV1Schema.parse(draft)).toThrow();
  });

  it("creates an immutable revision and clears corrected field uncertainty", () => {
    const original = menuDraftV1Schema.parse(firstRevision());
    const pricePatch = {
      correctionId: "3a9f568d-358b-45ba-bcdb-dbe206942115",
      correctedAt: "2026-09-22T00:02:00.000Z",
      actor: "user" as const,
      actorId: "26267474-3c2e-4caa-86e4-6981a840cfa2",
      reason: null,
      kind: "field" as const,
      sectionId: "noodles",
      itemId: "udon",
      field: "price" as const,
      value: "¥880",
    };

    const revised = createRevisedDraft({
      previous: original,
      revisionId: "770853d8-9332-4d15-82fb-f16fa4fc057b",
      createdAt: "2026-09-22T00:02:00.000Z",
      patches: [pricePatch],
      resolutions: [
        {
          issueId: "price:udon",
          status: "resolved",
          resolvedAt: "2026-09-22T00:02:00.000Z",
          correctionId: pricePatch.correctionId,
        },
      ],
    });

    expect(revised.revisionNumber).toBe(2);
    expect(revised.menu.sections[0]!.items[0]!.price).toEqual({
      sourceText: "¥880",
      confidence: 1,
      needsReview: false,
    });
    expect(original.menu.sections[0]!.items[0]!.price?.sourceText).toBe("¥800");
  });
});
