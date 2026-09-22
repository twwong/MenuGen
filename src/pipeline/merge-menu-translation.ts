import {
  menuExtractionV1Schema,
  type MenuExtractionV1,
  type MenuSourceExtractionV1,
  type MenuTranslationV1,
} from "@/domain/menu/menu-extraction";

export function mergeMenuTranslation(
  source: MenuSourceExtractionV1,
  translation: MenuTranslationV1,
): MenuExtractionV1 {
  const translatedSections = uniqueIndex(
    translation.sections,
    (section) => section.sectionId,
    "translated section",
  );

  assertSameIds(
    source.sections.map((section) => section.id),
    translatedSections,
    "section",
  );

  const sections = source.sections.map((section) => {
    const translatedSection = translatedSections.get(section.id);
    if (!translatedSection) {
      throw new Error(`Missing translation for section ${section.id}`);
    }

    const translatedItems = uniqueIndex(
      translatedSection.items,
      (item) => item.itemId,
      "translated item",
    );
    assertSameIds(
      section.items.map((item) => item.id),
      translatedItems,
      `item in section ${section.id}`,
    );

    return {
      ...section,
      title: mergeField(section.title, translatedSection.title),
      items: section.items.map((item) => {
        const translatedItem = translatedItems.get(item.id);
        if (!translatedItem) {
          throw new Error(`Missing translation for item ${item.id}`);
        }

        if (Boolean(item.description) !== Boolean(translatedItem.description)) {
          throw new Error(`Description alignment mismatch for item ${item.id}`);
        }

        return {
          ...item,
          name: mergeField(item.name, translatedItem.name),
          description:
            item.description && translatedItem.description
              ? mergeField(item.description, translatedItem.description)
              : undefined,
        };
      }),
    };
  });

  if (Boolean(source.title) !== Boolean(translation.title)) {
    throw new Error("Menu title alignment mismatch");
  }

  return menuExtractionV1Schema.parse({
    schemaVersion: "1",
    sourceLanguage: source.sourceLanguage,
    targetLanguage: translation.targetLanguage,
    title:
      source.title && translation.title
        ? mergeField(source.title, translation.title)
        : undefined,
    sections,
  });
}

function mergeField(
  source: { sourceText: string; confidence: number; needsReview: boolean },
  translation: {
    translatedText: string;
    confidence: number;
    needsReview: boolean;
  },
) {
  return {
    sourceText: source.sourceText,
    translatedText: translation.translatedText,
    confidence: Math.min(source.confidence, translation.confidence),
    needsReview: source.needsReview || translation.needsReview,
  };
}

function uniqueIndex<T>(
  values: T[],
  getId: (value: T) => string,
  label: string,
) {
  const index = new Map<string, T>();
  for (const value of values) {
    const id = getId(value);
    if (index.has(id)) {
      throw new Error(`Duplicate ${label} ID: ${id}`);
    }
    index.set(id, value);
  }
  return index;
}

function assertSameIds<T>(
  expectedIds: string[],
  actual: Map<string, T>,
  label: string,
) {
  const expected = new Set(expectedIds);
  for (const id of expected) {
    if (!actual.has(id)) {
      throw new Error(`Missing ${label} translation: ${id}`);
    }
  }
  for (const id of actual.keys()) {
    if (!expected.has(id)) {
      throw new Error(`Unexpected ${label} translation: ${id}`);
    }
  }
}
