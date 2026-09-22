import {
  menuSourceExtractionV1Schema,
  menuTranslationV1Schema,
  type MenuExtractionV1,
  type TargetLanguage,
} from "@/domain/menu/menu-extraction";
import {
  assessMenuConfidence,
  type MenuConfidenceAssessment,
} from "@/domain/menu/confidence-policy";
import { buildDishImageContext } from "@/pipeline/image-prompt";
import { mergeMenuTranslation } from "@/pipeline/merge-menu-translation";
import {
  providerMetadataSchema,
  type AiProviderSuite,
  type DishImageContext,
  type MenuSourceInput,
  type ProviderMetadata,
} from "@/providers/contracts";

export interface MenuPipelineResult {
  menu: MenuExtractionV1;
  confidenceAssessment: MenuConfidenceAssessment;
  imageContexts: DishImageContext[];
  stages: ProviderMetadata[];
}

export async function runMenuPipeline(options: {
  provider: AiProviderSuite;
  input: MenuSourceInput;
  targetLanguage: TargetLanguage;
}): Promise<MenuPipelineResult> {
  const stages: ProviderMetadata[] = [];

  const moderation = await options.provider.moderateInput(options.input);
  stages.push(providerMetadataSchema.parse(moderation.metadata));
  if (moderation.data.decision !== "allowed") {
    throw new Error(`Menu input was ${moderation.data.decision}`);
  }

  const extraction = await options.provider.extractMenu(options.input);
  stages.push(providerMetadataSchema.parse(extraction.metadata));
  const source = menuSourceExtractionV1Schema.parse(extraction.data);

  const translation = await options.provider.translateMenu(
    source,
    options.targetLanguage,
  );
  stages.push(providerMetadataSchema.parse(translation.metadata));
  const translated = menuTranslationV1Schema.parse(translation.data);

  if (translated.targetLanguage !== options.targetLanguage) {
    throw new Error(
      `Provider returned ${translated.targetLanguage}, expected ${options.targetLanguage}`,
    );
  }

  const menu = mergeMenuTranslation(source, translated);
  const confidenceAssessment = assessMenuConfidence(menu);
  const imageContexts =
    confidenceAssessment.disposition === "reject"
      ? []
      : menu.sections.flatMap((section) =>
          section.items
            .filter((item) =>
              ["prepared_food", "prepared_drink"].includes(
                item.imageEligibility,
              ),
            )
            .map(buildDishImageContext),
        );

  return { menu, confidenceAssessment, imageContexts, stages };
}
