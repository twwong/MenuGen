import type { FixtureProviderCase } from "@/providers/fixture/fixture-ai-provider";
import type { MenuSourceInput } from "@/providers/contracts";
import type { MenuConfidenceDisposition } from "@/domain/menu/confidence-policy";
import type { TargetLanguage } from "@/domain/menu/menu-extraction";

export interface MenuBenchmarkCase {
  id: string;
  riskTags: string[];
  targetLanguage: TargetLanguage;
  input: MenuSourceInput;
  providerFixture: FixtureProviderCase;
  expectations: {
    orderedItemIds: string[];
    priceTextByItemId: Record<string, string | undefined>;
    translatedNameByItemId: Record<string, string>;
    sourceClaimsByItemId: Record<string, string[]>;
    needsReviewItemIds: string[];
    generatedImageItemIds: string[];
    untrustedInputFragments: string[];
    forbiddenOutputFragments: string[];
    confidenceDisposition: MenuConfidenceDisposition;
  };
  budget: {
    typicalEligibleItemCount: number;
    maximumTypicalMenuCostUsd: number;
  };
}
