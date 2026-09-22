import { describe, expect, it } from "vitest";
import type { MenuExtractionV1 } from "./menu-extraction";
import { assessMenuConfidence } from "./confidence-policy";

function menuWithConfidence(
  confidence: number,
  needsReview: boolean,
): MenuExtractionV1 {
  return {
    schemaVersion: "1",
    sourceLanguage: "en",
    targetLanguage: "en",
    title: {
      sourceText: "Dinner",
      translatedText: "Dinner",
      confidence: 0.99,
      needsReview: false,
    },
    sections: [
      {
        id: "section",
        order: 0,
        title: {
          sourceText: "Mains",
          translatedText: "Mains",
          confidence: 0.99,
          needsReview: false,
        },
        items: [
          {
            id: "item",
            order: 0,
            name: {
              sourceText: "Special",
              translatedText: "Special",
              confidence,
              needsReview,
            },
            explicitSourceClaims: [],
            imageEligibility: needsReview ? "needs_review" : "prepared_food",
          },
        ],
      },
    ],
  };
}

describe("assessMenuConfidence", () => {
  it("accepts a menu whose fields clear the review threshold", () => {
    expect(assessMenuConfidence(menuWithConfidence(0.95, false))).toMatchObject(
      {
        disposition: "accept",
        unflaggedLowConfidenceCount: 0,
      },
    );
  });

  it("reports a low-confidence field that was not flagged", () => {
    expect(assessMenuConfidence(menuWithConfidence(0.7, false))).toMatchObject({
      disposition: "review",
      unflaggedLowConfidenceCount: 1,
    });
  });

  it("rejects a menu with a critically uncertain field", () => {
    expect(assessMenuConfidence(menuWithConfidence(0.35, true))).toMatchObject({
      disposition: "reject",
      lowestConfidence: 0.35,
    });
  });
});
