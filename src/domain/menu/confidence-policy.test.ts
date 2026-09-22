import { describe, expect, it } from "vitest";
import type { MenuExtractionV2 } from "./menu-extraction";
import { assessMenuConfidence } from "./confidence-policy";

function menuWithConfidence(
  confidence: number,
  needsReview: boolean,
): MenuExtractionV2 {
  return {
    schemaVersion: "2",
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
            price: {
              sourceText: "$12",
              confidence: 0.99,
              needsReview: false,
            },
            explicitSourceClaims: [],
            imageEligibility: needsReview ? "needs_review" : "prepared_food",
          },
        ],
      },
    ],
    sourcePhotoCandidates: [],
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

  it("treats a critically uncertain price as a rejectable source fact", () => {
    const menu = menuWithConfidence(0.95, false);
    const price = menu.sections[0].items[0].price;
    if (!price) throw new Error("Expected fixture price");
    price.confidence = 0.4;
    price.needsReview = true;

    expect(assessMenuConfidence(menu)).toMatchObject({
      disposition: "reject",
      criticalLowestConfidence: 0.4,
    });
  });

  it("reviews an uncertain photo association without rejecting the menu", () => {
    const menu = menuWithConfidence(0.95, false);
    menu.sourcePhotoCandidates.push({
      id: "photo-000",
      region: {
        sourceFileOrder: 0,
        pageIndex: 0,
        x: 0.1,
        y: 0.1,
        width: 0.4,
        height: 0.3,
        confidence: 0.95,
        needsReview: false,
      },
      association: {
        itemId: null,
        confidence: 0.2,
        needsReview: true,
      },
      usability: {
        status: "uncertain",
        confidence: 0.3,
        needsReview: true,
      },
    });

    expect(assessMenuConfidence(menu)).toMatchObject({
      disposition: "review",
      photoReviewFieldCount: 2,
      lowestConfidence: 0.2,
      criticalLowestConfidence: 0.95,
    });
  });
});
