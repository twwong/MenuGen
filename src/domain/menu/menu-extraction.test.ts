import { describe, expect, it } from "vitest";
import {
  menuExtractionV1Schema,
  menuExtractionV2Schema,
  upgradeMenuExtractionV1ToV2,
} from "./menu-extraction";

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

describe("menuExtractionV2Schema", () => {
  const validV2 = {
    schemaVersion: "2",
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
            price: {
              sourceText: "¥1,280",
              confidence: 0.96,
              needsReview: false,
            },
            explicitSourceClaims: ["miso", "ginger"],
            imageEligibility: "prepared_food",
          },
        ],
      },
    ],
    sourcePhotoCandidates: [
      {
        id: "photo-000",
        region: {
          sourceFileOrder: 0,
          pageIndex: 0,
          x: 0.5,
          y: 0.1,
          width: 0.4,
          height: 0.3,
          confidence: 0.95,
          needsReview: false,
        },
        association: {
          itemId: "mackerel",
          confidence: 0.93,
          needsReview: false,
        },
        usability: {
          status: "usable",
          confidence: 0.91,
          needsReview: false,
        },
      },
    ],
  } as const;

  it("preserves confident prices and source-photo associations", () => {
    const result = menuExtractionV2Schema.parse(validV2);

    expect(result.sections[0].items[0].price?.sourceText).toBe("¥1,280");
    expect(result.sourcePhotoCandidates[0].association.itemId).toBe("mackerel");
  });

  it("rejects out-of-page photo regions and unknown item references", () => {
    const invalid = menuExtractionV2Schema.parse(validV2);
    invalid.sourcePhotoCandidates[0].region.x = 0.8;
    invalid.sourcePhotoCandidates[0].association.itemId = "missing";

    const result = menuExtractionV2Schema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          "Photo region exceeds the page width",
          "Unknown associated item ID: missing",
        ]),
      );
    }
  });

  it("converts v1 prices conservatively and never invents photo candidates", () => {
    const upgraded = upgradeMenuExtractionV1ToV2(
      menuExtractionV1Schema.parse(validExtraction),
    );

    expect(upgraded.sections[0].items[0].price).toEqual({
      sourceText: "¥1,280",
      confidence: 0,
      needsReview: true,
    });
    expect(upgraded.sourcePhotoCandidates).toEqual([]);
  });
});
