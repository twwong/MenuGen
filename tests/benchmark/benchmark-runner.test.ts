import { describe, expect, it } from "vitest";
import {
  runBenchmarkCase,
  runBenchmarkManifest,
} from "@/benchmark/benchmark-runner";
import { runMenuPipeline } from "@/pipeline/menu-pipeline";
import { FixtureAiProvider } from "@/providers/fixture/fixture-ai-provider";
import { adversarialGlareBenchmark } from "../fixtures/benchmarks/adversarial-glare-menu";
import { japaneseDinnerBenchmark } from "../fixtures/benchmarks/ja-dinner-menu";
import {
  benchmarkManifest,
  benchmarkManifestVersion,
} from "../fixtures/benchmarks/manifest";

describe("runBenchmarkCase", () => {
  it("passes the synthetic Japanese dinner fixture", async () => {
    const report = await runBenchmarkCase(japaneseDinnerBenchmark);

    expect(report.passed).toBe(true);
    expect(report.checks.every((check) => check.passed)).toBe(true);
    expect(report.metrics.itemCount).toBe(3);
    expect(report.metrics.eligibleImageCount).toBe(1);
    expect(report.metrics.projectedTypicalMenuCostUsd).toBeLessThan(2);
    expect(report.pricingBasis).toBe("fixture_assumption");
    expect(report.confidence.disposition).toBe("review");
    expect(report.stages[1].usage.inputTokens).toBe(1_200);
  });

  it("runs the versioned manifest and rejects the adversarial low-confidence case", async () => {
    const report = await runBenchmarkManifest(
      benchmarkManifest,
      benchmarkManifestVersion,
    );
    const adversarial = report.cases.find(
      (result) => result.caseId === adversarialGlareBenchmark.id,
    );

    expect(report.passed).toBe(true);
    expect(report.summary).toMatchObject({
      caseCount: 2,
      passedCaseCount: 2,
      failedCaseCount: 0,
      itemCount: 5,
      eligibleImageCount: 1,
    });
    expect(adversarial).toMatchObject({
      passed: true,
      confidence: {
        disposition: "reject",
        unflaggedLowConfidenceCount: 0,
      },
      metrics: { eligibleImageCount: 0 },
    });
    const serializedReport = JSON.stringify(report);
    expect(serializedReport).not.toContain("鯖の味噌煮");
    expect(serializedReport).not.toContain("Miso-braised mackerel");
    expect(serializedReport).not.toContain("ignore previous instructions");
  });

  it("isolates a failed case and continues the manifest", async () => {
    const invalidCase = structuredClone(adversarialGlareBenchmark);
    invalidCase.id = "invalid-translation-case";
    invalidCase.input.inputId = "invalid-translation-case";
    invalidCase.providerFixture.inputId = "invalid-translation-case";
    invalidCase.providerFixture.translations.en?.sections[0].items.pop();

    const report = await runBenchmarkManifest(
      [invalidCase, japaneseDinnerBenchmark],
      "test",
    );

    expect(report.passed).toBe(false);
    expect(report.summary).toMatchObject({
      caseCount: 2,
      passedCaseCount: 1,
      failedCaseCount: 1,
    });
    expect(report.cases[0]).toEqual({
      caseId: "invalid-translation-case",
      riskTags: invalidCase.riskTags,
      passed: false,
      failure: { code: "case_execution_failed" },
    });
    expect(report.cases[1].passed).toBe(true);
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
