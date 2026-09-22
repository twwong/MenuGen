import {
  menuSourceExtractionV2Schema,
  menuTranslationV2Schema,
  type MenuExtractionV2,
  type SourcePhotoCandidate,
  type TargetLanguage,
} from "@/domain/menu/menu-extraction";
import {
  assessMenuConfidence,
  menuConfidencePolicyV2,
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
  menu: MenuExtractionV2;
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
  const source = menuSourceExtractionV2Schema.parse(extraction.data);

  const translation = await options.provider.translateMenu(
    source,
    options.targetLanguage,
  );
  stages.push(providerMetadataSchema.parse(translation.metadata));
  const translated = menuTranslationV2Schema.parse(translation.data);

  if (translated.targetLanguage !== options.targetLanguage) {
    throw new Error(
      `Provider returned ${translated.targetLanguage}, expected ${options.targetLanguage}`,
    );
  }

  const menu = mergeMenuTranslation(source, translated);
  const confidenceAssessment = assessMenuConfidence(menu);
  const sourcePhotoItemIds = new Set(
    menu.sourcePhotoCandidates
      .filter(isConfidentUsableSourcePhoto)
      .map((candidate) => candidate.association.itemId)
      .filter((itemId): itemId is string => itemId !== null),
  );
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
            .filter((item) => !sourcePhotoItemIds.has(item.id))
            .map(buildDishImageContext),
        );

  return { menu, confidenceAssessment, imageContexts, stages };
}

export function isConfidentUsableSourcePhoto(candidate: SourcePhotoCandidate) {
  const fields = [candidate.region, candidate.association, candidate.usability];
  return (
    candidate.association.itemId !== null &&
    candidate.usability.status === "usable" &&
    fields.every(
      (field) =>
        !field.needsReview &&
        field.confidence >= menuConfidencePolicyV2.reviewBelow,
    )
  );
}
