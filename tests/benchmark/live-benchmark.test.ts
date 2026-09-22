import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  assertFixtureHash,
  runLiveBenchmark,
  runLivePhotoAssociationBenchmark,
  validateLiveBenchmarkOptions,
  type LiveBenchmarkFixture,
} from "@/benchmark/live-benchmark";
import { FixtureAiProvider } from "@/providers/fixture/fixture-ai-provider";
import { japaneseDinnerBenchmark } from "../fixtures/benchmarks/ja-dinner-menu";

describe("live benchmark preflight", () => {
  it("requires explicit spend confirmation, credentials, and a safe cap", () => {
    expect(() => validateLiveBenchmarkOptions([], "key")).toThrow(
      "--confirm-spend",
    );
    expect(() =>
      validateLiveBenchmarkOptions(
        ["--", "--confirm-spend", "--max-usd", "2"],
        undefined,
      ),
    ).toThrow("OPENAI_API_KEY");
    expect(() =>
      validateLiveBenchmarkOptions(
        ["--confirm-spend", "--max-usd", "2.01"],
        "key",
      ),
    ).toThrow("no more than 2");
    expect(
      validateLiveBenchmarkOptions(
        ["--confirm-spend", "--max-usd", "2"],
        "key",
      ),
    ).toEqual({ apiKey: "key", maxUsd: 2, profile: "full" });
    expect(() =>
      validateLiveBenchmarkOptions(
        [
          "--profile",
          "photo-association",
          "--confirm-spend",
          "--max-usd",
          "0.76",
        ],
        "key",
      ),
    ).toThrow("no more than 0.75");
    expect(
      validateLiveBenchmarkOptions(
        [
          "--profile",
          "photo-association",
          "--confirm-spend",
          "--max-usd",
          "0.75",
        ],
        "key",
      ),
    ).toEqual({
      apiKey: "key",
      maxUsd: 0.75,
      profile: "photo-association",
    });
  });

  it("rejects fixture bytes that do not match the committed hash", () => {
    const content = Buffer.from("synthetic menu");
    const hash = createHash("sha256").update(content).digest("hex");

    expect(() => assertFixtureHash(content, hash)).not.toThrow();
    expect(() => assertFixtureHash(content, "0".repeat(64))).toThrow(
      "hash mismatch",
    );
  });
});

describe("runLiveBenchmark", () => {
  it("caps calls, compares image qualities, and emits a content-free report", async () => {
    const providerFixture = liveProviderFixture();
    const provider = new FixtureAiProvider(providerFixture);
    const saveImage = vi.fn().mockResolvedValue(undefined);

    const report = await runLiveBenchmark({
      fixtures: [liveFixture()],
      providers: {
        text: provider,
        imageLow: provider,
        imageMedium: provider,
      },
      maxUsd: 2,
      textModel: "text-test",
      imageModel: "image-test",
      saveImage,
    });

    expect(report.passed).toBe(true);
    expect(report).toMatchObject({ schemaVersion: "2", profile: "full" });
    expect(report.callCounts).toEqual({
      extractMenu: 1,
      translateMenu: 1,
      generateDishImage: 2,
    });
    expect(report.imageComparisons.map((result) => result.quality)).toEqual([
      "low",
      "medium",
    ]);
    expect(saveImage).toHaveBeenCalledTimes(2);
    expect(report.projection).toMatchObject({
      typicalEligibleItemCount: 40,
      passesTwoDollarTarget: true,
    });

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("鯖の味噌煮");
    expect(serialized).not.toContain("Create a realistic");
    expect(serialized).not.toContain("synthetic-ja-dinner.png");
    expect(serialized).not.toContain("fixture://");
  });

  it("does not retry after a reservation breach", async () => {
    const providerFixture = liveProviderFixture();
    providerFixture.costUsd.extract_menu = 0.36;
    const provider = new FixtureAiProvider(providerFixture);

    const report = await runLiveBenchmark({
      fixtures: [liveFixture()],
      providers: {
        text: provider,
        imageLow: provider,
        imageMedium: provider,
      },
      maxUsd: 2,
      textModel: "text-test",
      imageModel: "image-test",
      saveImage: vi.fn(),
    });

    expect(report.passed).toBe(false);
    expect(report.callCounts).toEqual({
      extractMenu: 1,
      translateMenu: 0,
      generateDishImage: 0,
    });
    expect(report.cases[0].failure?.code).toBe("budget_reservation_breached");
  });

  it("isolates a failed fixture and sanitizes its error", async () => {
    const provider = new FixtureAiProvider(liveProviderFixture());
    const invalidFixture = liveFixture();
    invalidFixture.id = "invalid-case";
    invalidFixture.input.inputId = "unknown-input";

    const report = await runLiveBenchmark({
      fixtures: [liveFixture(), invalidFixture],
      providers: {
        text: provider,
        imageLow: provider,
        imageMedium: provider,
      },
      maxUsd: 2,
      textModel: "text-test",
      imageModel: "image-test",
      saveImage: vi.fn().mockResolvedValue(undefined),
    });

    expect(report.cases[0].passed).toBe(true);
    expect(report.cases[1]).toEqual({
      caseId: "invalid-case",
      passed: false,
      failure: { code: "provider_call_failed" },
    });
    expect(JSON.stringify(report)).not.toContain("Unknown fixture input");
  });
});

describe("runLivePhotoAssociationBenchmark", () => {
  it("makes extraction calls only and emits confidence diagnostics", async () => {
    const provider = new FixtureAiProvider(liveProviderFixture());
    const translate = vi.spyOn(provider, "translateMenu");
    const generate = vi.spyOn(provider, "generateDishImage");
    const secondFixture = liveFixture();
    secondFixture.id = "second-format";

    const report = await runLivePhotoAssociationBenchmark({
      fixtures: [liveFixture(), secondFixture],
      provider,
      maxUsd: 0.75,
      textModel: "text-test",
    });

    expect(report).toMatchObject({
      schemaVersion: "2",
      profile: "photo_association",
      passed: true,
      callCounts: {
        extractMenu: 2,
        translateMenu: 0,
        generateDishImage: 0,
      },
    });
    expect(report.cases[0].sourcePhotoDiagnostics).toMatchObject({
      candidateCount: 1,
      reusableCount: 1,
      expectedAssociationMatched: true,
      expectedReuseReady: true,
      reasonCodes: [],
    });
    expect(translate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(JSON.stringify(report)).not.toContain("鯖の味噌煮");
    expect(JSON.stringify(report)).not.toContain("fixture://");
  });

  it("isolates extraction failures without retrying", async () => {
    const providerFixture = liveProviderFixture();
    providerFixture.costUsd.extract_menu = 0.36;
    const provider = new FixtureAiProvider(providerFixture);
    const extract = vi.spyOn(provider, "extractMenu");

    const report = await runLivePhotoAssociationBenchmark({
      fixtures: [liveFixture()],
      provider,
      maxUsd: 0.75,
      textModel: "text-test",
    });

    expect(report.passed).toBe(false);
    expect(report.callCounts.extractMenu).toBe(1);
    expect(report.cases[0].failure?.code).toBe("budget_reservation_breached");
    expect(extract).toHaveBeenCalledTimes(1);
  });

  it("keeps an ambiguous multi-item association under review", async () => {
    const providerFixture = liveProviderFixture();
    const candidate = providerFixture.extraction.sourcePhotoCandidates[0];
    candidate.association.itemId = null;
    candidate.association.confidence = 0.5;
    candidate.association.needsReview = true;
    const provider = new FixtureAiProvider(providerFixture);

    const report = await runLivePhotoAssociationBenchmark({
      fixtures: [liveFixture()],
      provider,
      maxUsd: 0.75,
      textModel: "text-test",
    });

    expect(report.passed).toBe(false);
    expect(report.cases[0].sourcePhotoDiagnostics).toMatchObject({
      expectedAssociationMatched: false,
      expectedReuseReady: false,
      reviewCounts: { association: 1 },
      reasonCodes: [
        "expected_item_unassociated",
        "association_below_threshold",
        "association_requires_review",
      ],
    });
  });
});

function liveProviderFixture() {
  const fixture = structuredClone(japaneseDinnerBenchmark.providerFixture);
  const dailySpecial = fixture.extraction.sections[0].items.find(
    (item) => item.id === "daily-special",
  );
  if (!dailySpecial?.price) throw new Error("Expected daily-special price");
  dailySpecial.imageEligibility = "prepared_food";
  dailySpecial.price.confidence = 0.8;
  dailySpecial.price.needsReview = true;
  return fixture;
}

function liveFixture(): LiveBenchmarkFixture {
  return {
    id: japaneseDinnerBenchmark.id,
    input: structuredClone(japaneseDinnerBenchmark.input),
    targetLanguage: "en",
    expectations: {
      orderedSourceNames: ["鯖の味噌煮", "本日のおすすめ", "瓶ビール"],
      priceTextBySourceName: {
        鯖の味噌煮: "¥1,280",
        本日のおすすめ: "時価",
        瓶ビール: "¥680",
      },
      reviewPriceSourceName: "本日のおすすめ",
      sourcePhotoSourceName: "鯖の味噌煮",
      generatedImageSourceName: "本日のおすすめ",
      forbiddenOutputFragments: ["ignore previous instructions"],
    },
  };
}
