import { describe, expect, it } from "vitest";
import { menuExtractionV1Schema } from "./menu-extraction";

const validExtraction = {
  schemaVersion: "1",
  sourceLanguage: "ja",
  targetLanguage: "en",
  sections: [
    {
      id: "dinner",
      order: 0,
      title: {
        sourceText: "晩ごはん",
        translatedText: "Dinner",
        confidence: 0.99,
        needsReview: false,
      },
      items: [
        {
          id: "mackerel",
          order: 0,
          name: {
            sourceText: "鯖の味噌煮",
            translatedText: "Miso-braised mackerel",
            confidence: 0.94,
            needsReview: false,
          },
          priceText: "¥1,280",
          explicitSourceClaims: ["miso", "ginger"],
          imageEligibility: "prepared_food",
        },
      ],
    },
  ],
} as const;

describe("menuExtractionV1Schema", () => {
  it("preserves source text, exact price text, and explicit claims", () => {
    const result = menuExtractionV1Schema.parse(validExtraction);
    const item = result.sections[0].items[0];

    expect(item.name.sourceText).toBe("鯖の味噌煮");
    expect(item.priceText).toBe("¥1,280");
    expect(item.explicitSourceClaims).toEqual(["miso", "ginger"]);
  });

  it("rejects unmodeled inferred safety claims", () => {
    const unsafeExtraction = structuredClone(validExtraction) as Record<
      string,
      unknown
    >;
    const sections = unsafeExtraction.sections as Array<{
      items: Array<Record<string, unknown>>;
    }>;
    sections[0].items[0].inferredAllergens = ["soy"];

    expect(menuExtractionV1Schema.safeParse(unsafeExtraction).success).toBe(
      false,
    );
  });

  it("rejects confidence values outside the zero-to-one range", () => {
    const invalidConfidence = menuExtractionV1Schema.parse(validExtraction);
    invalidConfidence.sections[0].items[0].name.confidence = 1.2;

    expect(menuExtractionV1Schema.safeParse(invalidConfidence).success).toBe(
      false,
    );
  });
});
