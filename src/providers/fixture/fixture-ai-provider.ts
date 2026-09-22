import type {
  MenuSourceExtractionV1,
  MenuTranslationV1,
  TargetLanguage,
} from "@/domain/menu/menu-extraction";
import type {
  AiProviderSuite,
  DishImageContext,
  GeneratedImage,
  MenuSourceInput,
  ModerationDecision,
  ProviderMetadata,
  ProviderResult,
} from "@/providers/contracts";

type FixtureOperation = ProviderMetadata["operation"];

export interface FixtureProviderCase {
  inputId: string;
  extraction: MenuSourceExtractionV1;
  translations: Partial<Record<TargetLanguage, MenuTranslationV1>>;
  costUsd: Record<FixtureOperation, number>;
}

export class FixtureAiProvider implements AiProviderSuite {
  constructor(private readonly fixture: FixtureProviderCase) {}

  async moderateInput(
    input: MenuSourceInput,
  ): Promise<ProviderResult<ModerationDecision>> {
    this.assertInput(input.inputId);
    return this.result(
      { decision: "allowed", categories: [] },
      "moderate_input",
    );
  }

  async extractMenu(
    input: MenuSourceInput,
  ): Promise<ProviderResult<MenuSourceExtractionV1>> {
    this.assertInput(input.inputId);
    return this.result(this.fixture.extraction, "extract_menu", {
      inputTokens: 1_200,
      outputTokens: 650,
    });
  }

  async translateMenu(
    _menu: MenuSourceExtractionV1,
    targetLanguage: TargetLanguage,
  ): Promise<ProviderResult<MenuTranslationV1>> {
    const translation = this.fixture.translations[targetLanguage];
    if (!translation) {
      throw new Error(`Fixture has no ${targetLanguage} translation`);
    }

    return this.result(translation, "translate_menu", {
      inputTokens: 650,
      outputTokens: 320,
    });
  }

  async generateDishImage(
    context: DishImageContext,
  ): Promise<ProviderResult<GeneratedImage>> {
    return this.result(
      {
        assetRef: `fixture://generated/${context.itemId}`,
        mimeType: "image/webp",
        width: 1024,
        height: 1024,
        provenance: "generated",
      },
      "generate_dish_image",
      { images: 1 },
    );
  }

  async moderateImage(
    image: GeneratedImage,
  ): Promise<ProviderResult<ModerationDecision>> {
    if (!image.assetRef.startsWith("fixture://generated/")) {
      throw new Error(`Unknown fixture image: ${image.assetRef}`);
    }

    return this.result(
      { decision: "allowed", categories: [] },
      "moderate_image",
      { images: 1 },
    );
  }

  private assertInput(inputId: string) {
    if (inputId !== this.fixture.inputId) {
      throw new Error(`Unknown fixture input: ${inputId}`);
    }
  }

  private result<T>(
    data: T,
    operation: FixtureOperation,
    usage: Partial<ProviderMetadata["usage"]> = {},
  ): ProviderResult<T> {
    return {
      data: structuredClone(data),
      metadata: {
        provider: "fixture",
        model: "fixture-v1",
        operation,
        latencyMs: 0,
        estimatedCostUsd: this.fixture.costUsd[operation],
        usage: {
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          images: usage.images ?? 0,
        },
      },
    };
  }
}
