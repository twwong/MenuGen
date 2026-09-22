import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { providerMetadataSchema } from "@/providers/contracts";
import {
  OpenAiProvider,
  type OpenAiProviderOptions,
} from "./openai-ai-provider";

const parsedSourceMenu = {
  schemaVersion: "2",
  sourceLanguage: "ja",
  title: null,
  sections: [
    {
      id: "section-000",
      order: 0,
      title: {
        sourceText: "魚料理",
        confidence: 0.99,
        needsReview: false,
      },
      items: [
        {
          id: "item-000-000",
          order: 0,
          name: {
            sourceText: "鯖の味噌煮",
            confidence: 0.95,
            needsReview: false,
          },
          description: null,
          price: {
            sourceText: "¥1,280",
            confidence: 0.99,
            needsReview: false,
          },
          explicitSourceClaims: ["味噌"],
          imageEligibility: "prepared_food",
        },
      ],
    },
  ],
  sourcePhotoCandidates: [],
} as const;

const parsedTranslation = {
  schemaVersion: "2",
  sourceSchemaVersion: "2",
  targetLanguage: "en",
  title: null,
  sections: [
    {
      sectionId: "section-000",
      title: {
        translatedText: "Fish dishes",
        confidence: 0.99,
        needsReview: false,
      },
      items: [
        {
          itemId: "item-000-000",
          name: {
            translatedText: "Miso-braised mackerel",
            confidence: 0.94,
            needsReview: false,
          },
          description: null,
        },
      ],
    },
  ],
} as const;

describe("OpenAiProvider", () => {
  it("extracts and translates with strict structured outputs and cost metadata", async () => {
    const { provider, responsesParse } = createProvider();
    responsesParse
      .mockResolvedValueOnce(textResponse(parsedSourceMenu, 100, 50))
      .mockResolvedValueOnce(textResponse(parsedTranslation, 80, 40));

    const extraction = await provider.extractMenu({
      inputId: "menu-1",
      files: [
        {
          ref: "https://assets.example/page-2.png",
          fileName: "page-2.png",
          mimeType: "image/png",
          pageOrder: 1,
        },
        {
          ref: "https://assets.example/page-1.png",
          fileName: "page-1.png",
          mimeType: "image/png",
          pageOrder: 0,
        },
      ],
    });
    const translation = await provider.translateMenu(extraction.data, "en");

    expect(extraction.data.title).toBeUndefined();
    expect(extraction.data.sections[0].items[0].description).toBeUndefined();
    expect(extraction.data.sections[0].items[0].price?.sourceText).toBe(
      "¥1,280",
    );
    expect(extraction.metadata.estimatedCostUsd).toBeCloseTo(0.0006);
    expect(extraction.metadata.usage).toEqual({
      inputTokens: 100,
      outputTokens: 50,
      images: 0,
    });
    expect(providerMetadataSchema.parse(extraction.metadata)).toEqual(
      extraction.metadata,
    );
    expect(translation.data.sections[0].items[0].name.translatedText).toBe(
      "Miso-braised mackerel",
    );

    const extractionRequest = responsesParse.mock.calls[0][0];
    expect(extractionRequest.store).toBe(false);
    expect(extractionRequest.instructions).toContain("untrusted data");
    expect(extractionRequest.text.format.type).toBe("json_schema");
    expect(extractionRequest.input[0].content[1].image_url).toBe(
      "https://assets.example/page-1.png",
    );
    expect(extractionRequest.input[0].content[2].image_url).toBe(
      "https://assets.example/page-2.png",
    );

    const translationRequest = responsesParse.mock.calls[1][0];
    expect(translationRequest.instructions).toContain("untrusted data");
    expect(translationRequest.input[0].content[0].text).toContain(
      '"targetLanguage":"en"',
    );
  });

  it("rejects provider-inaccessible input references before making a request", async () => {
    const { provider, responsesParse } = createProvider();

    await expect(
      provider.extractMenu({
        inputId: "menu-1",
        files: [
          {
            ref: "fixture://menu-1/page-1",
            fileName: "page-1.png",
            mimeType: "image/png",
            pageOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow("must be HTTPS");
    expect(responsesParse).not.toHaveBeenCalled();
  });

  it("blocks flagged images and makes unsupported PDF moderation visible", async () => {
    const { provider, moderationsCreate } = createProvider();
    moderationsCreate.mockResolvedValue({
      model: "omni-moderation-test",
      results: [
        {
          categories: {
            violence: true,
            harassment: false,
          },
        },
      ],
    });

    const imageDecision = await provider.moderateInput({
      inputId: "menu-1",
      files: [
        {
          ref: "https://assets.example/page-1.png",
          fileName: "page-1.png",
          mimeType: "image/png",
          pageOrder: 0,
        },
      ],
    });
    const pdfDecision = await provider.moderateInput({
      inputId: "menu-2",
      files: [
        {
          ref: "data:application/pdf;base64,cGRm",
          fileName: "menu.pdf",
          mimeType: "application/pdf",
          pageOrder: 0,
        },
      ],
    });
    const mixedDecision = await provider.moderateInput({
      inputId: "menu-3",
      files: [
        {
          ref: "https://assets.example/page-1.png",
          fileName: "page-1.png",
          mimeType: "image/png",
          pageOrder: 0,
        },
        {
          ref: "https://assets.example/menu.pdf",
          fileName: "menu.pdf",
          mimeType: "application/pdf",
          pageOrder: 1,
        },
      ],
    });

    expect(imageDecision.data).toEqual({
      decision: "blocked",
      categories: ["violence"],
    });
    expect(pdfDecision.data).toEqual({
      decision: "needs_review",
      categories: ["unsupported_moderation_input:application/pdf"],
    });
    expect(mixedDecision.data).toEqual({
      decision: "blocked",
      categories: ["violence", "unsupported_moderation_input:application/pdf"],
    });
    expect(moderationsCreate).toHaveBeenCalledTimes(2);
  });

  it("returns generated image data with provenance and usage", async () => {
    const { provider, imagesGenerate } = createProvider();
    imagesGenerate.mockResolvedValue({
      created: 1,
      data: [{ b64_json: "aW1hZ2U=" }],
      output_format: "webp",
      size: "1024x1024",
      usage: {
        input_tokens: 20,
        output_tokens: 100,
        total_tokens: 120,
        input_tokens_details: {
          text_tokens: 20,
          image_tokens: 0,
        },
        output_tokens_details: {
          text_tokens: 0,
          image_tokens: 100,
        },
      },
    });

    const result = await provider.generateDishImage({
      itemId: "item-000-000",
      sourceName: "鯖の味噌煮",
      translatedName: "Miso-braised mackerel",
      explicitSourceClaims: ["味噌"],
      prompt: "Create a neutral visual estimate.",
    });

    expect(result.data).toEqual({
      assetRef: "data:image/webp;base64,aW1hZ2U=",
      mimeType: "image/webp",
      width: 1024,
      height: 1024,
      provenance: "generated",
    });
    expect(result.metadata.estimatedCostUsd).toBeCloseTo(0.0031);
    expect(result.metadata.usage).toEqual({
      inputTokens: 20,
      outputTokens: 100,
      images: 1,
      textInputTokens: 20,
      imageInputTokens: 0,
      imageOutputTokens: 100,
    });
  });

  it("uses the configured image fallback only when usage is absent", async () => {
    const { provider, imagesGenerate } = createProvider();
    imagesGenerate.mockResolvedValue({
      created: 1,
      data: [{ b64_json: "aW1hZ2U=" }],
      output_format: "webp",
      size: "1024x1024",
    });

    const result = await provider.generateDishImage({
      itemId: "item-000-000",
      sourceName: "鯖の味噌煮",
      translatedName: "Miso-braised mackerel",
      explicitSourceClaims: ["味噌"],
      prompt: "Create a neutral visual estimate.",
    });

    expect(result.metadata.estimatedCostUsd).toBe(0.04);
    expect(result.metadata.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      images: 1,
    });
  });

  it("rejects a structured response with no parsed output", async () => {
    const { provider, responsesParse } = createProvider();
    responsesParse.mockResolvedValue(textResponse(null, 0, 0));

    await expect(
      provider.extractMenu({
        inputId: "menu-1",
        files: [
          {
            ref: "data:image/png;base64,aW1hZ2U=",
            fileName: "page.png",
            mimeType: "image/png",
            pageOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow("no parsed menu extraction");
  });
});

function createProvider() {
  const responsesParse = vi.fn();
  const imagesGenerate = vi.fn();
  const moderationsCreate = vi.fn();
  const client = {
    responses: { parse: responsesParse },
    images: { generate: imagesGenerate },
    moderations: { create: moderationsCreate },
  } as unknown as Pick<OpenAI, "responses" | "images" | "moderations">;
  let time = 0;
  const options: OpenAiProviderOptions = {
    client,
    textModel: "gpt-test",
    imageModel: "gpt-image-test",
    moderationModel: "omni-moderation-test",
    pricing: {
      textInputUsdPerMillionTokens: 2,
      textOutputUsdPerMillionTokens: 8,
      imageTextInputUsdPerMillionTokens: 5,
      imageInputUsdPerMillionTokens: 8,
      imageOutputUsdPerMillionTokens: 30,
      imageGenerationFallbackUsd: 0.04,
      moderationRequestUsd: 0,
    },
    image: {
      size: "1024x1024",
      quality: "medium",
      outputFormat: "webp",
    },
    now: () => (time += 5),
  };

  return {
    provider: new OpenAiProvider(options),
    responsesParse,
    imagesGenerate,
    moderationsCreate,
  };
}

function textResponse(
  output_parsed: unknown,
  input_tokens: number,
  output_tokens: number,
) {
  return {
    output_parsed,
    model: "gpt-test-snapshot",
    usage: { input_tokens, output_tokens },
  };
}
