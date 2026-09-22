import { z } from "zod";

export const confidenceSchema = z.number().min(0).max(1);
export const targetLanguageSchema = z.enum(["en", "es", "fr", "ja", "zh-CN"]);
export const imageEligibilitySchema = z.enum([
  "prepared_food",
  "prepared_drink",
  "not_eligible",
  "needs_review",
]);

export const sourceFieldSchema = z
  .object({
    sourceText: z.string().min(1),
    confidence: confidenceSchema,
    needsReview: z.boolean(),
  })
  .strict();

export const translationFieldSchema = z
  .object({
    translatedText: z.string().min(1),
    confidence: confidenceSchema,
    needsReview: z.boolean(),
  })
  .strict();

export const translatedFieldSchema = z
  .object({
    sourceText: z.string().min(1),
    translatedText: z.string().min(1),
    confidence: confidenceSchema,
    needsReview: z.boolean(),
  })
  .strict();

const menuItemSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    name: translatedFieldSchema,
    description: translatedFieldSchema.optional(),
    priceText: z.string().min(1).optional(),
    explicitSourceClaims: z.array(z.string().min(1)),
    imageEligibility: imageEligibilitySchema,
  })
  .strict();

const menuSectionSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    title: translatedFieldSchema,
    items: z.array(menuItemSchema),
  })
  .strict();

export const menuExtractionV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    sourceLanguage: z.string().min(2),
    targetLanguage: targetLanguageSchema,
    title: translatedFieldSchema.optional(),
    sections: z.array(menuSectionSchema),
  })
  .strict();

export type MenuExtractionV1 = z.infer<typeof menuExtractionV1Schema>;
export type TargetLanguage = z.infer<typeof targetLanguageSchema>;

const sourceMenuItemSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    name: sourceFieldSchema,
    description: sourceFieldSchema.optional(),
    priceText: z.string().min(1).optional(),
    explicitSourceClaims: z.array(z.string().min(1)),
    imageEligibility: imageEligibilitySchema,
  })
  .strict();

const sourceMenuSectionSchema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    title: sourceFieldSchema,
    items: z.array(sourceMenuItemSchema),
  })
  .strict();

export const menuSourceExtractionV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    sourceLanguage: z.string().min(2),
    title: sourceFieldSchema.optional(),
    sections: z.array(sourceMenuSectionSchema),
  })
  .strict();

const itemTranslationSchema = z
  .object({
    itemId: z.string().min(1),
    name: translationFieldSchema,
    description: translationFieldSchema.optional(),
  })
  .strict();

const sectionTranslationSchema = z
  .object({
    sectionId: z.string().min(1),
    title: translationFieldSchema,
    items: z.array(itemTranslationSchema),
  })
  .strict();

export const menuTranslationV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    sourceSchemaVersion: z.literal("1"),
    targetLanguage: targetLanguageSchema,
    title: translationFieldSchema.optional(),
    sections: z.array(sectionTranslationSchema),
  })
  .strict();

export type MenuSourceExtractionV1 = z.infer<
  typeof menuSourceExtractionV1Schema
>;
export type MenuTranslationV1 = z.infer<typeof menuTranslationV1Schema>;
