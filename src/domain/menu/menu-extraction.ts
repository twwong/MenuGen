import { z } from "zod";

const confidenceSchema = z.number().min(0).max(1);

const translatedFieldSchema = z
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
    imageEligibility: z.enum([
      "prepared_food",
      "prepared_drink",
      "not_eligible",
      "needs_review",
    ]),
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
    targetLanguage: z.enum(["en", "es", "fr", "ja", "zh-CN"]),
    title: translatedFieldSchema.optional(),
    sections: z.array(menuSectionSchema),
  })
  .strict();

export type MenuExtractionV1 = z.infer<typeof menuExtractionV1Schema>;
