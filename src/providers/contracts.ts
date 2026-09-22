import { z } from "zod";
import type {
  MenuSourceExtractionV2,
  MenuTranslationV2,
  TargetLanguage,
} from "@/domain/menu/menu-extraction";

export const providerOperationSchema = z.enum([
  "moderate_input",
  "assess_preflight",
  "extract_menu",
  "translate_menu",
  "generate_dish_image",
  "moderate_image",
]);

export const providerMetadataSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1),
    operation: providerOperationSchema,
    latencyMs: z.number().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        images: z.number().int().nonnegative(),
        textInputTokens: z.number().int().nonnegative().optional(),
        imageInputTokens: z.number().int().nonnegative().optional(),
        imageOutputTokens: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

export type ProviderMetadata = z.infer<typeof providerMetadataSchema>;

export interface ProviderResult<T> {
  data: T;
  metadata: ProviderMetadata;
}

export interface MenuSourceInput {
  inputId: string;
  files: ReadonlyArray<{
    ref: string;
    fileName: string;
    mimeType: "application/pdf" | "image/jpeg" | "image/png";
    pageOrder: number;
  }>;
}

export interface ModerationDecision {
  decision: "allowed" | "blocked" | "needs_review";
  categories: string[];
}

export interface GeneratedImage {
  assetRef: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  provenance: "generated";
}

export interface DishImageContext {
  itemId: string;
  sourceName: string;
  translatedName: string;
  translatedDescription?: string;
  explicitSourceClaims: string[];
  prompt: string;
}

export interface MenuExtractionProvider {
  extractMenu(
    input: MenuSourceInput,
  ): Promise<ProviderResult<MenuSourceExtractionV2>>;
}

export interface MenuTranslationProvider {
  translateMenu(
    menu: MenuSourceExtractionV2,
    targetLanguage: TargetLanguage,
  ): Promise<ProviderResult<MenuTranslationV2>>;
}

export interface DishImageProvider {
  generateDishImage(
    context: DishImageContext,
  ): Promise<ProviderResult<GeneratedImage>>;
}

export interface ModerationProvider {
  moderateInput(
    input: MenuSourceInput,
  ): Promise<ProviderResult<ModerationDecision>>;
  moderateImage(
    image: GeneratedImage,
  ): Promise<ProviderResult<ModerationDecision>>;
}

export interface AiProviderSuite
  extends
    MenuExtractionProvider,
    MenuTranslationProvider,
    DishImageProvider,
    ModerationProvider {}
