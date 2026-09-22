import type { MenuExtractionV1 } from "@/domain/menu/menu-extraction";
import type { DishImageContext } from "@/providers/contracts";

type MenuItem = MenuExtractionV1["sections"][number]["items"][number];

export function buildDishImageContext(item: MenuItem): DishImageContext {
  const statedFacts = item.explicitSourceClaims.length
    ? item.explicitSourceClaims.join(", ")
    : "No ingredients or dietary facts were explicitly stated.";
  const description = item.description?.translatedText;

  return {
    itemId: item.id,
    sourceName: item.name.sourceText,
    translatedName: item.name.translatedText,
    translatedDescription: description,
    explicitSourceClaims: [...item.explicitSourceClaims],
    prompt: [
      `Create a realistic plated-food visual estimate for “${item.name.translatedText}” (${item.name.sourceText}).`,
      description ? `Menu description: ${description}` : undefined,
      `Menu-stated facts only: ${statedFacts}`,
      "Use plausible neutral restaurant presentation. Do not imitate a specific restaurant, logo, room, plate, or claimed serving style.",
      "Do not add text, badges, allergen claims, dietary labels, or ingredients not stated by the menu.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
