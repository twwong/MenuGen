import { z } from "zod";

import {
  imageEligibilitySchema,
  menuExtractionV2Schema,
} from "@/domain/menu/menu-extraction";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

const correctionBaseSchema = z.object({
  correctionId: uuidSchema,
  correctedAt: timestampSchema,
  actor: z.enum(["anonymous_owner", "user"]),
  actorId: uuidSchema.nullable(),
  reason: z.string().trim().min(1).max(280).nullable(),
});

const fieldCorrectionSchema = correctionBaseSchema
  .extend({
    kind: z.literal("field"),
    sectionId: z.string().min(1),
    itemId: z.string().min(1).nullable(),
    field: z.enum([
      "section_title_source",
      "section_title_translation",
      "item_name_source",
      "item_name_translation",
      "item_description_source",
      "item_description_translation",
      "price",
    ]),
    value: z.string().trim().min(1).max(2_000),
  })
  .strict();

const orderCorrectionSchema = correctionBaseSchema
  .extend({
    kind: z.literal("order"),
    sectionId: z.string().min(1),
    itemId: z.string().min(1).nullable(),
    order: z.number().int().nonnegative(),
  })
  .strict();

const sectionCorrectionSchema = correctionBaseSchema
  .extend({
    kind: z.literal("section"),
    itemId: z.string().min(1),
    fromSectionId: z.string().min(1),
    toSectionId: z.string().min(1),
    order: z.number().int().nonnegative(),
  })
  .strict();

const photoAssociationCorrectionSchema = correctionBaseSchema
  .extend({
    kind: z.literal("photo_association"),
    candidateId: z.string().min(1),
    itemId: z.string().min(1).nullable(),
  })
  .strict();

const eligibilityCorrectionSchema = correctionBaseSchema
  .extend({
    kind: z.literal("image_eligibility"),
    itemId: z.string().min(1),
    value: imageEligibilitySchema,
  })
  .strict();

export const reviewPatchSchema = z.discriminatedUnion("kind", [
  fieldCorrectionSchema,
  orderCorrectionSchema,
  sectionCorrectionSchema,
  photoAssociationCorrectionSchema,
  eligibilityCorrectionSchema,
]);

export const reviewResolutionSchema = z
  .object({
    issueId: z.string().min(1),
    status: z.enum(["resolved", "accepted_uncertainty"]),
    resolvedAt: timestampSchema,
    correctionId: uuidSchema.nullable(),
  })
  .strict();

export const menuDraftV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    menuId: uuidSchema,
    revisionId: uuidSchema,
    revisionNumber: z.number().int().positive(),
    basedOnRevisionId: uuidSchema.nullable(),
    createdAt: timestampSchema,
    menu: menuExtractionV2Schema,
    corrections: z.array(reviewPatchSchema),
    reviewResolutions: z.array(reviewResolutionSchema),
  })
  .strict()
  .superRefine((revision, context) => {
    if (revision.revisionNumber === 1 && revision.basedOnRevisionId !== null) {
      context.addIssue({
        code: "custom",
        message: "The first revision cannot reference a previous revision",
        path: ["basedOnRevisionId"],
      });
    }
    if (revision.revisionNumber > 1 && revision.basedOnRevisionId === null) {
      context.addIssue({
        code: "custom",
        message: "Later revisions must reference their previous revision",
        path: ["basedOnRevisionId"],
      });
    }

    const correctionIds = new Set(
      revision.corrections.map((correction) => correction.correctionId),
    );
    for (const [index, resolution] of revision.reviewResolutions.entries()) {
      if (
        resolution.correctionId !== null &&
        !correctionIds.has(resolution.correctionId)
      ) {
        context.addIssue({
          code: "custom",
          message: "Review resolution references an unknown correction",
          path: ["reviewResolutions", index, "correctionId"],
        });
      }
    }
  });

export type MenuDraftV1 = z.infer<typeof menuDraftV1Schema>;
export type ReviewPatch = z.infer<typeof reviewPatchSchema>;
export type ReviewResolution = z.infer<typeof reviewResolutionSchema>;

export function createRevisedDraft(input: {
  previous: MenuDraftV1;
  revisionId: string;
  createdAt: string;
  patches: readonly ReviewPatch[];
  resolutions: readonly ReviewResolution[];
}): MenuDraftV1 {
  const previous = menuDraftV1Schema.parse(input.previous);
  const menu = structuredClone(previous.menu);

  for (const patch of input.patches) {
    applyPatch(menu, reviewPatchSchema.parse(patch));
  }

  return menuDraftV1Schema.parse({
    schemaVersion: "1",
    menuId: previous.menuId,
    revisionId: input.revisionId,
    revisionNumber: previous.revisionNumber + 1,
    basedOnRevisionId: previous.revisionId,
    createdAt: input.createdAt,
    menu,
    corrections: [...previous.corrections, ...input.patches],
    reviewResolutions: [
      ...previous.reviewResolutions.filter(
        (existing) =>
          !input.resolutions.some(
            (replacement) => replacement.issueId === existing.issueId,
          ),
      ),
      ...input.resolutions,
    ],
  });
}

function applyPatch(menu: MenuDraftV1["menu"], patch: ReviewPatch): void {
  if (patch.kind === "photo_association") {
    const candidate = menu.sourcePhotoCandidates.find(
      (entry) => entry.id === patch.candidateId,
    );
    if (!candidate) throw new Error("Unknown source-photo candidate");
    if (patch.itemId && !findItem(menu, patch.itemId)) {
      throw new Error("Unknown source-photo item");
    }
    candidate.association = {
      itemId: patch.itemId,
      confidence: 1,
      needsReview: patch.itemId === null,
    };
    return;
  }

  if (patch.kind === "section") {
    const fromSection = findSection(menu, patch.fromSectionId);
    const toSection = findSection(menu, patch.toSectionId);
    const itemIndex = fromSection.items.findIndex(
      (item) => item.id === patch.itemId,
    );
    if (itemIndex < 0) throw new Error("Unknown item in source section");
    const [item] = fromSection.items.splice(itemIndex, 1);
    if (!item) throw new Error("Unknown item in source section");
    item.order = patch.order;
    toSection.items.push(item);
    normalizeItemOrder(fromSection.items);
    normalizeItemOrder(toSection.items);
    return;
  }

  if (patch.kind === "image_eligibility") {
    const item = findItem(menu, patch.itemId);
    if (!item) throw new Error("Unknown item for image eligibility");
    item.imageEligibility = patch.value;
    return;
  }

  const section = findSection(menu, patch.sectionId);
  if (patch.kind === "order") {
    if (patch.itemId === null) {
      section.order = patch.order;
      menu.sections.sort((left, right) => left.order - right.order);
      menu.sections.forEach((entry, index) => {
        entry.order = index;
      });
      return;
    }
    const item = findItemInSection(section, patch.itemId);
    item.order = patch.order;
    normalizeItemOrder(section.items);
    return;
  }

  const target = patch.itemId
    ? findItemInSection(section, patch.itemId)
    : section;
  switch (patch.field) {
    case "section_title_source":
      if (!("title" in target))
        throw new Error("Section title requires a section");
      target.title.sourceText = patch.value;
      target.title.confidence = 1;
      target.title.needsReview = false;
      break;
    case "section_title_translation":
      if (!("title" in target))
        throw new Error("Section title requires a section");
      target.title.translatedText = patch.value;
      target.title.confidence = 1;
      target.title.needsReview = false;
      break;
    case "item_name_source":
      if (!("name" in target)) throw new Error("Item name requires an item");
      target.name.sourceText = patch.value;
      target.name.confidence = 1;
      target.name.needsReview = false;
      break;
    case "item_name_translation":
      if (!("name" in target)) throw new Error("Item name requires an item");
      target.name.translatedText = patch.value;
      target.name.confidence = 1;
      target.name.needsReview = false;
      break;
    case "item_description_source":
    case "item_description_translation": {
      if (!("name" in target))
        throw new Error("Item description requires an item");
      if (!target.description) {
        throw new Error(
          "A missing description needs both source and translation before it can be added",
        );
      } else {
        if (patch.field === "item_description_source") {
          target.description.sourceText = patch.value;
        } else {
          target.description.translatedText = patch.value;
        }
        target.description.confidence = 1;
        target.description.needsReview = false;
      }
      break;
    }
    case "price":
      if (!("name" in target)) throw new Error("Price requires an item");
      target.price = {
        sourceText: patch.value,
        confidence: 1,
        needsReview: false,
      };
      break;
  }
}

function findSection(menu: MenuDraftV1["menu"], sectionId: string) {
  const section = menu.sections.find((entry) => entry.id === sectionId);
  if (!section) throw new Error("Unknown menu section");
  return section;
}

function findItem(menu: MenuDraftV1["menu"], itemId: string) {
  return menu.sections
    .flatMap((section) => section.items)
    .find((item) => item.id === itemId);
}

function findItemInSection(
  section: MenuDraftV1["menu"]["sections"][number],
  itemId: string,
) {
  const item = section.items.find((entry) => entry.id === itemId);
  if (!item) throw new Error("Unknown menu item");
  return item;
}

function normalizeItemOrder(
  items: MenuDraftV1["menu"]["sections"][number]["items"],
): void {
  items.sort((left, right) => left.order - right.order);
  items.forEach((item, index) => {
    item.order = index;
  });
}
