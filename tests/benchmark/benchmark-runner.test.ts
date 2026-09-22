import { describe, expect, it } from "vitest";
import { runBenchmarkCase } from "@/benchmark/benchmark-runner";
import { runMenuPipeline } from "@/pipeline/menu-pipeline";
import { FixtureAiProvider } from "@/providers/fixture/fixture-ai-provider";
import { japaneseDinnerBenchmark } from "../fixtures/benchmarks/ja-dinner-menu";

describe("runBenchmarkCase", () => {
  it("passes the synthetic Japanese dinner fixture", async () => {
    const report = await runBenchmarkCase(japaneseDinnerBenchmark);

    expect(report.passed).toBe(true);
    expect(report.checks.every((check) => check.passed)).toBe(true);
    expect(report.metrics.itemCount).toBe(3);
    expect(report.metrics.eligibleImageCount).toBe(1);
    expect(report.metrics.projectedTypicalMenuCostUsd).toBeLessThan(2);
    expect(report.pricingBasis).toBe("fixture_assumption");
  });

  it("keeps the lower confidence and source review flag", async () => {
    const result = await runMenuPipeline({
      provider: new FixtureAiProvider(japaneseDinnerBenchmark.providerFixture),
      input: japaneseDinnerBenchmark.input,
      targetLanguage: "en",
    });
    const [mackerel, dailySpecial] = result.menu.sections[0].items;

    expect(mackerel.name.confidence).toBe(0.95);
    expect(dailySpecial.name.needsReview).toBe(true);
    expect(result.imageContexts.map((context) => context.itemId)).toEqual([
      "mackerel",
    ]);
    expect(result.imageContexts[0].explicitSourceClaims).toEqual([
      "味噌",
      "生姜",
    ]);
  });

  it("rejects translations that do not align by stable item ID", async () => {
    const invalidFixture = structuredClone(
      japaneseDinnerBenchmark.providerFixture,
    );
    invalidFixture.translations.en?.sections[0].items.pop();

    await expect(
      runMenuPipeline({
        provider: new FixtureAiProvider(invalidFixture),
        input: japaneseDinnerBenchmark.input,
        targetLanguage: "en",
      }),
    ).rejects.toThrow("Missing item in section fish translation: bottled-beer");
  });
});
