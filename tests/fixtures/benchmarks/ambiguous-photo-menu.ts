import type { MenuBenchmarkCase } from "@/benchmark/types";

export const ambiguousPhotoBenchmark: MenuBenchmarkCase = {
  id: "synthetic-ambiguous-photo-v1",
  riskTags: ["ambiguous_photo_association", "multiple_adjacent_items"],
  targetLanguage: "en",
  input: {
    inputId: "synthetic-ambiguous-photo-v1",
    files: [
      {
        ref: "fixture://synthetic-ambiguous-photo-v1/page-1",
        fileName: "synthetic-ambiguous-photo.png",
        mimeType: "image/png",
        pageOrder: 0,
      },
    ],
  },
  providerFixture: {
    inputId: "synthetic-ambiguous-photo-v1",
    extraction: {
      schemaVersion: "2",
      sourceLanguage: "ja",
      sections: [
        {
          id: "small-plates",
          order: 0,
          title: {
            sourceText: "小皿料理",
            confidence: 0.98,
            needsReview: false,
          },
          items: [
            {
              id: "gyoza",
              order: 0,
              name: {
                sourceText: "焼き餃子",
                confidence: 0.97,
                needsReview: false,
              },
              price: {
                sourceText: "¥650",
                confidence: 0.99,
                needsReview: false,
              },
              explicitSourceClaims: [],
              imageEligibility: "prepared_food",
            },
            {
              id: "noodles",
              order: 1,
              name: {
                sourceText: "担々麺",
                confidence: 0.97,
                needsReview: false,
              },
              price: {
                sourceText: "¥980",
                confidence: 0.99,
                needsReview: false,
              },
              explicitSourceClaims: [],
              imageEligibility: "prepared_food",
            },
          ],
        },
      ],
      sourcePhotoCandidates: [
        {
          id: "photo-between-items",
          region: {
            sourceFileOrder: 0,
            pageIndex: 0,
            x: 0.5,
            y: 0.12,
            width: 0.42,
            height: 0.34,
            confidence: 0.96,
            needsReview: false,
          },
          association: {
            itemId: null,
            confidence: 0.5,
            needsReview: true,
          },
          usability: {
            status: "usable",
            confidence: 0.94,
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
        sections: [
          {
            sectionId: "small-plates",
            title: {
              translatedText: "Small plates",
              confidence: 0.98,
              needsReview: false,
            },
            items: [
              {
                itemId: "gyoza",
                name: {
                  translatedText: "Pan-fried dumplings",
                  confidence: 0.96,
                  needsReview: false,
                },
              },
              {
                itemId: "noodles",
                name: {
                  translatedText: "Tantan noodles",
                  confidence: 0.95,
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
      assess_preflight: 0,
      extract_menu: 0.012,
      translate_menu: 0.004,
      generate_dish_image: 0.035,
      moderate_image: 0.001,
    },
  },
  expectations: {
    orderedItemIds: ["gyoza", "noodles"],
    priceTextByItemId: {
      gyoza: "¥650",
      noodles: "¥980",
    },
    translatedNameByItemId: {
      gyoza: "Pan-fried dumplings",
      noodles: "Tantan noodles",
    },
    sourceClaimsByItemId: {
      gyoza: [],
      noodles: [],
    },
    needsReviewItemIds: [],
    generatedImageItemIds: ["gyoza", "noodles"],
    reusedSourcePhotoItemIds: [],
    reviewSourcePhotoCandidateIds: ["photo-between-items"],
    confidenceDisposition: "review",
    untrustedInputFragments: [],
    forbiddenOutputFragments: [],
  },
  budget: {
    typicalEligibleItemCount: 40,
    maximumTypicalMenuCostUsd: 2,
  },
};
