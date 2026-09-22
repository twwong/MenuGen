import type { MenuBenchmarkCase } from "@/benchmark/types";

export const japaneseDinnerBenchmark: MenuBenchmarkCase = {
  id: "synthetic-ja-dinner-v1",
  riskTags: ["regional_dish", "ambiguous_item", "packaged_drink"],
  targetLanguage: "en",
  input: {
    inputId: "synthetic-ja-dinner-v1",
    files: [
      {
        ref: "fixture://synthetic-ja-dinner-v1/page-1",
        fileName: "synthetic-ja-dinner.png",
        mimeType: "image/png",
        pageOrder: 0,
      },
    ],
  },
  providerFixture: {
    inputId: "synthetic-ja-dinner-v1",
    extraction: {
      schemaVersion: "2",
      sourceLanguage: "ja",
      title: {
        sourceText: "晩ごはん",
        confidence: 0.99,
        needsReview: false,
      },
      sections: [
        {
          id: "fish",
          order: 0,
          title: {
            sourceText: "魚料理",
            confidence: 0.99,
            needsReview: false,
          },
          items: [
            {
              id: "mackerel",
              order: 0,
              name: {
                sourceText: "鯖の味噌煮",
                confidence: 0.96,
                needsReview: false,
              },
              description: {
                sourceText: "味噌と生姜でじっくり煮込みました",
                confidence: 0.93,
                needsReview: false,
              },
              price: {
                sourceText: "¥1,280",
                confidence: 0.99,
                needsReview: false,
              },
              explicitSourceClaims: ["味噌", "生姜"],
              imageEligibility: "prepared_food",
            },
            {
              id: "daily-special",
              order: 1,
              name: {
                sourceText: "本日のおすすめ",
                confidence: 0.72,
                needsReview: true,
              },
              description: {
                sourceText: "内容はスタッフまで",
                confidence: 0.91,
                needsReview: false,
              },
              price: {
                sourceText: "時価",
                confidence: 0.96,
                needsReview: false,
              },
              explicitSourceClaims: [],
              imageEligibility: "needs_review",
            },
            {
              id: "bottled-beer",
              order: 2,
              name: {
                sourceText: "瓶ビール",
                confidence: 0.98,
                needsReview: false,
              },
              price: {
                sourceText: "¥680",
                confidence: 0.99,
                needsReview: false,
              },
              explicitSourceClaims: [],
              imageEligibility: "not_eligible",
            },
          ],
        },
      ],
      sourcePhotoCandidates: [
        {
          id: "photo-mackerel",
          region: {
            sourceFileOrder: 0,
            pageIndex: 0,
            x: 0.55,
            y: 0.1,
            width: 0.4,
            height: 0.32,
            confidence: 0.97,
            needsReview: false,
          },
          association: {
            itemId: "mackerel",
            confidence: 0.96,
            needsReview: false,
          },
          usability: {
            status: "usable",
            confidence: 0.95,
            needsReview: false,
          },
        },
      ],
    },
    translations: {
      en: {
        schemaVersion: "2",
        sourceSchemaVersion: "2",
        targetLanguage: "en",
        title: {
          translatedText: "Dinner",
          confidence: 0.99,
          needsReview: false,
        },
        sections: [
          {
            sectionId: "fish",
            title: {
              translatedText: "Fish dishes",
              confidence: 0.99,
              needsReview: false,
            },
            items: [
              {
                itemId: "mackerel",
                name: {
                  translatedText: "Miso-braised mackerel",
                  confidence: 0.95,
                  needsReview: false,
                },
                description: {
                  translatedText:
                    "Mackerel slowly simmered with miso and ginger",
                  confidence: 0.94,
                  needsReview: false,
                },
              },
              {
                itemId: "daily-special",
                name: {
                  translatedText: "Today's recommendation",
                  confidence: 0.88,
                  needsReview: false,
                },
                description: {
                  translatedText: "Ask staff for details",
                  confidence: 0.96,
                  needsReview: false,
                },
              },
              {
                itemId: "bottled-beer",
                name: {
                  translatedText: "Bottled beer",
                  confidence: 0.99,
                  needsReview: false,
                },
              },
            ],
          },
        ],
      },
    },
    costUsd: {
      moderate_input: 0.0001,
      extract_menu: 0.012,
      translate_menu: 0.004,
      generate_dish_image: 0.035,
      moderate_image: 0.001,
    },
  },
  expectations: {
    orderedItemIds: ["mackerel", "daily-special", "bottled-beer"],
    priceTextByItemId: {
      mackerel: "¥1,280",
      "daily-special": "時価",
      "bottled-beer": "¥680",
    },
    translatedNameByItemId: {
      mackerel: "Miso-braised mackerel",
      "daily-special": "Today's recommendation",
      "bottled-beer": "Bottled beer",
    },
    sourceClaimsByItemId: {
      mackerel: ["味噌", "生姜"],
      "daily-special": [],
      "bottled-beer": [],
    },
    needsReviewItemIds: ["daily-special"],
    generatedImageItemIds: [],
    confidenceDisposition: "review",
    untrustedInputFragments: [],
    forbiddenOutputFragments: ["peanut-free"],
  },
  budget: {
    typicalEligibleItemCount: 40,
    maximumTypicalMenuCostUsd: 2,
  },
};
