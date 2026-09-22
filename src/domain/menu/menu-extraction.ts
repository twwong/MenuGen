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

const normalizedCoordinateSchema = z.number().min(0).max(1);

export const sourcePhotoCandidateSchema = z
  .object({
    id: z.string().min(1),
    region: z
      .object({
        sourceFileOrder: z.number().int().nonnegative(),
        pageIndex: z.number().int().nonnegative(),
        x: normalizedCoordinateSchema,
        y: normalizedCoordinateSchema,
        width: normalizedCoordinateSchema.gt(0),
        height: normalizedCoordinateSchema.gt(0),
        confidence: confidenceSchema,
        needsReview: z.boolean(),
      })
      .strict()
      .superRefine((region, context) => {
        if (region.x + region.width > 1) {
          context.addIssue({
            code: "custom",
            message: "Photo region exceeds the page width",
            path: ["width"],
          });
        }
        if (region.y + region.height > 1) {
          context.addIssue({
            code: "custom",
            message: "Photo region exceeds the page height",
            path: ["height"],
          });
        }
      }),
    association: z
      .object({
        itemId: z.string().min(1).nullable(),
        confidence: confidenceSchema,
        needsReview: z.boolean(),
      })
      .strict(),
    usability: z
      .object({
        status: z.enum(["usable", "unusable", "uncertain"]),
        confidence: confidenceSchema,
        needsReview: z.boolean(),
      })
      .strict(),
  })
  .strict()
  .superRefine((candidate, context) => {
    if (
      candidate.association.itemId === null &&
      !candidate.association.needsReview
    ) {
      context.addIssue({
        code: "custom",
        message: "An unassociated source photo must require review",
        path: ["association", "needsReview"],
      });
    }
    if (
      candidate.usability.status === "uncertain" &&
      !candidate.usability.needsReview
    ) {
      context.addIssue({
        code: "custom",
        message: "Uncertain source-photo usability must require review",
        path: ["usability", "needsReview"],
      });
    }
  });

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

const menuItemV2Schema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    name: translatedFieldSchema,
    description: translatedFieldSchema.optional(),
    price: sourceFieldSchema.optional(),
    explicitSourceClaims: z.array(z.string().min(1)),
    imageEligibility: imageEligibilitySchema,
  })
  .strict();

const menuSectionV2Schema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    title: translatedFieldSchema,
    items: z.array(menuItemV2Schema),
  })
  .strict();

const menuExtractionV2BaseSchema = z
  .object({
    schemaVersion: z.literal("2"),
    sourceLanguage: z.string().min(2),
    targetLanguage: targetLanguageSchema,
    title: translatedFieldSchema.optional(),
    sections: z.array(menuSectionV2Schema),
    sourcePhotoCandidates: z.array(sourcePhotoCandidateSchema),
  })
  .strict();

export const menuExtractionV2Schema =
  menuExtractionV2BaseSchema.superRefine(validateV2References);

const sourceMenuItemV2Schema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    name: sourceFieldSchema,
    description: sourceFieldSchema.optional(),
    price: sourceFieldSchema.optional(),
    explicitSourceClaims: z.array(z.string().min(1)),
    imageEligibility: imageEligibilitySchema,
  })
  .strict();

const sourceMenuSectionV2Schema = z
  .object({
    id: z.string().min(1),
    order: z.number().int().nonnegative(),
    title: sourceFieldSchema,
    items: z.array(sourceMenuItemV2Schema),
  })
  .strict();

const menuSourceExtractionV2BaseSchema = z
  .object({
    schemaVersion: z.literal("2"),
    sourceLanguage: z.string().min(2),
    title: sourceFieldSchema.optional(),
    sections: z.array(sourceMenuSectionV2Schema),
    sourcePhotoCandidates: z.array(sourcePhotoCandidateSchema),
  })
  .strict();

export const menuSourceExtractionV2Schema =
  menuSourceExtractionV2BaseSchema.superRefine(validateV2References);

export const menuTranslationV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    sourceSchemaVersion: z.literal("2"),
    targetLanguage: targetLanguageSchema,
    title: translationFieldSchema.optional(),
    sections: z.array(sectionTranslationSchema),
  })
  .strict();

export type MenuExtractionV2 = z.infer<typeof menuExtractionV2Schema>;
export type MenuSourceExtractionV2 = z.infer<
  typeof menuSourceExtractionV2Schema
>;
export type MenuTranslationV2 = z.infer<typeof menuTranslationV2Schema>;
export type SourcePhotoCandidate = z.infer<typeof sourcePhotoCandidateSchema>;

export function upgradeMenuExtractionV1ToV2(
  input: MenuExtractionV1,
): MenuExtractionV2 {
  const menu = menuExtractionV1Schema.parse(input);
  return menuExtractionV2Schema.parse({
    ...menu,
    schemaVersion: "2",
    sections: menu.sections.map((section) => ({
      ...section,
      items: section.items.map(({ priceText, ...item }) => ({
        ...item,
        ...(priceText
          ? {
              price: {
                sourceText: priceText,
                confidence: 0,
                needsReview: true,
              },
            }
          : {}),
      })),
    })),
    sourcePhotoCandidates: [],
  });
}

export function upgradeMenuSourceExtractionV1ToV2(
  input: MenuSourceExtractionV1,
): MenuSourceExtractionV2 {
  const menu = menuSourceExtractionV1Schema.parse(input);
  return menuSourceExtractionV2Schema.parse({
    ...menu,
    schemaVersion: "2",
    sections: menu.sections.map((section) => ({
      ...section,
      items: section.items.map(({ priceText, ...item }) => ({
        ...item,
        ...(priceText
          ? {
              price: {
                sourceText: priceText,
                confidence: 0,
                needsReview: true,
              },
            }
          : {}),
      })),
    })),
    sourcePhotoCandidates: [],
  });
}

export function upgradeMenuTranslationV1ToV2(
  input: MenuTranslationV1,
): MenuTranslationV2 {
  const translation = menuTranslationV1Schema.parse(input);
  return menuTranslationV2Schema.parse({
    ...translation,
    schemaVersion: "2",
    sourceSchemaVersion: "2",
  });
}

function validateV2References(
  menu:
    | z.infer<typeof menuExtractionV2BaseSchema>
    | z.infer<typeof menuSourceExtractionV2BaseSchema>,
  context: z.RefinementCtx,
) {
  const sectionIds = new Set<string>();
  const itemIds = new Set<string>();
  const candidateIds = new Set<string>();

  for (const [sectionIndex, section] of menu.sections.entries()) {
    if (sectionIds.has(section.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate section ID: ${section.id}`,
        path: ["sections", sectionIndex, "id"],
      });
    }
    sectionIds.add(section.id);
    for (const [itemIndex, item] of section.items.entries()) {
      if (itemIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate item ID: ${item.id}`,
          path: ["sections", sectionIndex, "items", itemIndex, "id"],
        });
      }
      itemIds.add(item.id);
    }
  }

  for (const [
    candidateIndex,
    candidate,
  ] of menu.sourcePhotoCandidates.entries()) {
    if (candidateIds.has(candidate.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate source-photo candidate ID: ${candidate.id}`,
        path: ["sourcePhotoCandidates", candidateIndex, "id"],
      });
    }
    candidateIds.add(candidate.id);
    if (
      candidate.association.itemId !== null &&
      !itemIds.has(candidate.association.itemId)
    ) {
      context.addIssue({
        code: "custom",
        message: `Unknown associated item ID: ${candidate.association.itemId}`,
        path: [
          "sourcePhotoCandidates",
          candidateIndex,
          "association",
          "itemId",
        ],
      });
    }
  }
}
