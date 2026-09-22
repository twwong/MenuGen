import type { FixtureProviderCase } from "@/providers/fixture/fixture-ai-provider";
import type { MenuSourceInput } from "@/providers/contracts";

export interface MenuBenchmarkCase {
  id: string;
  input: MenuSourceInput;
  providerFixture: FixtureProviderCase;
  expectations: {
    orderedItemIds: string[];
    priceTextByItemId: Record<string, string | undefined>;
    translatedNameByItemId: Record<string, string>;
    sourceClaimsByItemId: Record<string, string[]>;
    needsReviewItemIds: string[];
    generatedImageItemIds: string[];
    forbiddenOutputFragments: string[];
  };
  budget: {
    typicalEligibleItemCount: number;
    maximumTypicalMenuCostUsd: number;
  };
}
