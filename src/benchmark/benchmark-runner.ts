import type { MenuBenchmarkCase } from "@/benchmark/types";
import { runMenuPipeline } from "@/pipeline/menu-pipeline";
import { FixtureAiProvider } from "@/providers/fixture/fixture-ai-provider";

export interface BenchmarkCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface BenchmarkReport {
  caseId: string;
  passed: boolean;
  pricingBasis: "fixture_assumption";
  checks: BenchmarkCheck[];
  metrics: {
    itemCount: number;
    eligibleImageCount: number;
    observedFixtureCostUsd: number;
    projectedTypicalMenuCostUsd: number;
    maximumTypicalMenuCostUsd: number;
  };
  stages: Array<{
    operation: string;
    provider: string;
    model: string;
    latencyMs: number;
    estimatedCostUsd: number;
  }>;
}

export async function runBenchmarkCase(
  benchmarkCase: MenuBenchmarkCase,
): Promise<BenchmarkReport> {
  const provider = new FixtureAiProvider(benchmarkCase.providerFixture);
  const result = await runMenuPipeline({
    provider,
    input: benchmarkCase.input,
    targetLanguage: "en",
  });
  const items = result.menu.sections.flatMap((section) => section.items);
  const itemById = new Map(items.map((item) => [item.id, item]));

  const actualOrder = items.map((item) => item.id);
  const actualReviewIds = items
    .filter((item) => item.name.needsReview || item.description?.needsReview)
    .map((item) => item.id);
  const actualGeneratedIds = result.imageContexts.map((item) => item.itemId);
  const serializedMenu = JSON.stringify(result.menu).toLocaleLowerCase("en");

  const checks: BenchmarkCheck[] = [
    equalityCheck(
      "source item order is preserved",
      actualOrder,
      benchmarkCase.expectations.orderedItemIds,
    ),
    equalityCheck(
      "uncertain items stay marked for review",
      actualReviewIds,
      benchmarkCase.expectations.needsReviewItemIds,
    ),
    equalityCheck(
      "only eligible items receive image prompts",
      actualGeneratedIds,
      benchmarkCase.expectations.generatedImageItemIds,
    ),
    everyItemCheck(
      "price text is preserved exactly",
      itemById,
      benchmarkCase.expectations.priceTextByItemId,
      (item) => item.priceText,
    ),
    everyItemCheck(
      "translations match the expected benchmark",
      itemById,
      benchmarkCase.expectations.translatedNameByItemId,
      (item) => item.name.translatedText,
    ),
    everyItemCheck(
      "only explicit source claims survive",
      itemById,
      benchmarkCase.expectations.sourceClaimsByItemId,
      (item) => item.explicitSourceClaims,
    ),
    {
      name: "untrusted instructions and invented safety claims stay absent",
      passed: benchmarkCase.expectations.forbiddenOutputFragments.every(
        (fragment) =>
          !serializedMenu.includes(fragment.toLocaleLowerCase("en")),
      ),
      detail: `${benchmarkCase.expectations.forbiddenOutputFragments.length} forbidden fragments checked`,
    },
  ];

  const observedFixtureCostUsd = sum(
    result.stages.map((stage) => stage.estimatedCostUsd),
  );
  const perImageCostUsd =
    benchmarkCase.providerFixture.costUsd.generate_dish_image +
    benchmarkCase.providerFixture.costUsd.moderate_image;
  const projectedTypicalMenuCostUsd =
    observedFixtureCostUsd +
    benchmarkCase.budget.typicalEligibleItemCount * perImageCostUsd;

  checks.push({
    name: "typical-menu projection stays within the cost ceiling",
    passed:
      projectedTypicalMenuCostUsd <=
      benchmarkCase.budget.maximumTypicalMenuCostUsd,
    detail: `$${projectedTypicalMenuCostUsd.toFixed(4)} projected vs $${benchmarkCase.budget.maximumTypicalMenuCostUsd.toFixed(2)} ceiling`,
  });

  return {
    caseId: benchmarkCase.id,
    passed: checks.every((check) => check.passed),
    pricingBasis: "fixture_assumption",
    checks,
    metrics: {
      itemCount: items.length,
      eligibleImageCount: result.imageContexts.length,
      observedFixtureCostUsd: roundUsd(observedFixtureCostUsd),
      projectedTypicalMenuCostUsd: roundUsd(projectedTypicalMenuCostUsd),
      maximumTypicalMenuCostUsd: benchmarkCase.budget.maximumTypicalMenuCostUsd,
    },
    stages: result.stages.map((stage) => ({
      operation: stage.operation,
      provider: stage.provider,
      model: stage.model,
      latencyMs: stage.latencyMs,
      estimatedCostUsd: stage.estimatedCostUsd,
    })),
  };
}

function equalityCheck(
  name: string,
  actual: unknown,
  expected: unknown,
): BenchmarkCheck {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  return {
    name,
    passed,
    detail: passed ? "matched" : "mismatch",
  };
}

function everyItemCheck<T>(
  name: string,
  itemById: Map<
    string,
    {
      priceText?: string;
      name: { translatedText: string };
      explicitSourceClaims: string[];
    }
  >,
  expectedById: Record<string, T>,
  select: (item: NonNullable<ReturnType<typeof itemById.get>>) => T,
): BenchmarkCheck {
  const entries = Object.entries(expectedById) as Array<[string, T]>;
  const passed = entries.every(([id, expected]) => {
    const item = itemById.get(id);
    return item && JSON.stringify(select(item)) === JSON.stringify(expected);
  });
  return {
    name,
    passed: Boolean(passed),
    detail: `${entries.length} items checked`,
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundUsd(value: number) {
  return Math.round(value * 10_000) / 10_000;
}
