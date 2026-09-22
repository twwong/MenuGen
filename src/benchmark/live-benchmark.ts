import { createHash } from "node:crypto";
import type { TargetLanguage } from "@/domain/menu/menu-extraction";
import { assessMenuConfidence } from "@/domain/menu/confidence-policy";
import { buildDishImageContext } from "@/pipeline/image-prompt";
import { isConfidentUsableSourcePhoto } from "@/pipeline/menu-pipeline";
import { mergeMenuTranslation } from "@/pipeline/merge-menu-translation";
import type {
  AiProviderSuite,
  GeneratedImage,
  MenuSourceInput,
  ProviderMetadata,
} from "@/providers/contracts";

export const maximumLiveBenchmarkSpendUsd = 2;
export const liveBenchmarkReservationsUsd = {
  extractMenu: 0.35,
  translateMenu: 0.2,
  imageLow: 0.15,
  imageMedium: 0.35,
} as const;

export interface LiveBenchmarkFixture {
  id: string;
  input: MenuSourceInput;
  targetLanguage: TargetLanguage;
  expectations: {
    orderedSourceNames: string[];
    priceTextBySourceName: Record<string, string>;
    reviewPriceSourceName: string;
    sourcePhotoSourceName: string;
    generatedImageSourceName: string;
    forbiddenOutputFragments: string[];
  };
}

export interface LiveBenchmarkProviders {
  text: AiProviderSuite;
  imageLow: AiProviderSuite;
  imageMedium: AiProviderSuite;
}

export interface LiveBenchmarkReport {
  schemaVersion: "1";
  passed: boolean;
  pricingBasis: "measured_provider_usage";
  models: {
    text: string;
    image: string;
  };
  budget: {
    maximumUsd: number;
    reservedUsd: number;
    actualEstimatedCostUsd: number;
    reservationBreached: boolean;
  };
  callCounts: {
    extractMenu: number;
    translateMenu: number;
    generateDishImage: number;
  };
  cases: LiveBenchmarkCaseReport[];
  imageComparisons: LiveBenchmarkImageReport[];
  projection: {
    typicalEligibleItemCount: 40;
    projectedTypicalMenuCostUsd: number | null;
    passesTwoDollarTarget: boolean;
  };
}

export interface LiveBenchmarkCaseReport {
  caseId: string;
  passed: boolean;
  checks?: Array<{ name: string; passed: boolean }>;
  confidence?: ReturnType<typeof assessMenuConfidence>;
  metrics?: {
    itemCount: number;
    sourcePhotoCandidateCount: number;
    reusableSourcePhotoCount: number;
    generationCandidateCount: number;
  };
  stages?: ProviderMetadata[];
  failure?: { code: LiveBenchmarkFailureCode };
}

export interface LiveBenchmarkImageReport {
  quality: "low" | "medium";
  passed: boolean;
  stage?: ProviderMetadata;
  failure?: { code: LiveBenchmarkFailureCode };
}

export type LiveBenchmarkFailureCode =
  | "budget_reservation_exceeded"
  | "budget_reservation_breached"
  | "provider_call_failed"
  | "generation_candidate_missing"
  | "artifact_write_failed";

interface BudgetTicket {
  amountUsd: number;
}

class LiveBudgetGuard {
  private reserved = 0;
  private actual = 0;
  private breached = false;

  constructor(private readonly maximumUsd: number) {}

  reserve(amountUsd: number): BudgetTicket {
    if (this.breached || this.reserved + amountUsd > this.maximumUsd) {
      throw new LiveBenchmarkError("budget_reservation_exceeded");
    }
    this.reserved += amountUsd;
    return { amountUsd };
  }

  complete(ticket: BudgetTicket, actualUsd: number) {
    this.actual += actualUsd;
    if (actualUsd > ticket.amountUsd || this.actual > this.maximumUsd) {
      this.breached = true;
      throw new LiveBenchmarkError("budget_reservation_breached");
    }
  }

  snapshot() {
    return {
      maximumUsd: this.maximumUsd,
      reservedUsd: roundUsd(this.reserved),
      actualEstimatedCostUsd: roundUsd(this.actual),
      reservationBreached: this.breached,
    };
  }
}

class LiveBenchmarkError extends Error {
  constructor(readonly code: LiveBenchmarkFailureCode) {
    super(code);
  }
}

export async function runLiveBenchmark(options: {
  fixtures: LiveBenchmarkFixture[];
  providers: LiveBenchmarkProviders;
  maxUsd: number;
  textModel: string;
  imageModel: string;
  saveImage: (
    quality: "low" | "medium",
    image: GeneratedImage,
  ) => Promise<void>;
}): Promise<LiveBenchmarkReport> {
  if (options.fixtures.length === 0 || options.fixtures.length > 2) {
    throw new Error("Live benchmark requires one or two fixtures");
  }

  const budget = new LiveBudgetGuard(options.maxUsd);
  const callCounts = {
    extractMenu: 0,
    translateMenu: 0,
    generateDishImage: 0,
  };
  const cases: LiveBenchmarkCaseReport[] = [];
  const generationContexts: ReturnType<typeof buildDishImageContext>[] = [];

  for (const fixture of options.fixtures) {
    try {
      const extractionTicket = budget.reserve(
        liveBenchmarkReservationsUsd.extractMenu,
      );
      callCounts.extractMenu += 1;
      const extraction = await options.providers.text.extractMenu(
        fixture.input,
      );
      budget.complete(extractionTicket, extraction.metadata.estimatedCostUsd);

      const translationTicket = budget.reserve(
        liveBenchmarkReservationsUsd.translateMenu,
      );
      callCounts.translateMenu += 1;
      const translation = await options.providers.text.translateMenu(
        extraction.data,
        fixture.targetLanguage,
      );
      budget.complete(translationTicket, translation.metadata.estimatedCostUsd);

      const menu = mergeMenuTranslation(extraction.data, translation.data);
      const confidence = assessMenuConfidence(menu);
      const items = menu.sections.flatMap((section) => section.items);
      const itemsBySourceName = new Map(
        items.map((item) => [item.name.sourceText, item]),
      );
      const reusablePhotoItemIds = new Set(
        menu.sourcePhotoCandidates
          .filter(isConfidentUsableSourcePhoto)
          .map((candidate) => candidate.association.itemId)
          .filter((itemId): itemId is string => itemId !== null),
      );
      const imageContexts = items
        .filter((item) =>
          ["prepared_food", "prepared_drink"].includes(item.imageEligibility),
        )
        .filter((item) => !reusablePhotoItemIds.has(item.id))
        .map(buildDishImageContext);
      const expectedGeneratedItem = itemsBySourceName.get(
        fixture.expectations.generatedImageSourceName,
      );
      if (expectedGeneratedItem) {
        const context = imageContexts.find(
          (candidate) => candidate.itemId === expectedGeneratedItem.id,
        );
        if (context) generationContexts.push(context);
      }

      const serializedMenu = JSON.stringify(menu).toLocaleLowerCase("en");
      const checks = [
        {
          name: "source order preserved",
          passed:
            JSON.stringify(items.map((item) => item.name.sourceText)) ===
            JSON.stringify(fixture.expectations.orderedSourceNames),
        },
        {
          name: "price text preserved",
          passed: Object.entries(
            fixture.expectations.priceTextBySourceName,
          ).every(
            ([sourceName, priceText]) =>
              itemsBySourceName.get(sourceName)?.price?.sourceText ===
              priceText,
          ),
        },
        {
          name: "ambiguous price flagged",
          passed:
            itemsBySourceName.get(fixture.expectations.reviewPriceSourceName)
              ?.price?.needsReview === true,
        },
        {
          name: "source photo confidently associated",
          passed: menu.sourcePhotoCandidates.some((candidate) => {
            const item = items.find(
              (entry) => entry.id === candidate.association.itemId,
            );
            return (
              item?.name.sourceText ===
                fixture.expectations.sourcePhotoSourceName &&
              isConfidentUsableSourcePhoto(candidate)
            );
          }),
        },
        {
          name: "source photo suppresses generation",
          passed: !imageContexts.some(
            (context) =>
              context.sourceName === fixture.expectations.sourcePhotoSourceName,
          ),
        },
        {
          name: "text-only item remains generation eligible",
          passed: imageContexts.some(
            (context) =>
              context.sourceName ===
              fixture.expectations.generatedImageSourceName,
          ),
        },
        {
          name: "untrusted instructions absent",
          passed: fixture.expectations.forbiddenOutputFragments.every(
            (fragment) =>
              !serializedMenu.includes(fragment.toLocaleLowerCase("en")),
          ),
        },
        {
          name: "low confidence never silently accepted",
          passed: confidence.unflaggedLowConfidenceCount === 0,
        },
      ];

      cases.push({
        caseId: fixture.id,
        passed: checks.every((check) => check.passed),
        checks,
        confidence,
        metrics: {
          itemCount: items.length,
          sourcePhotoCandidateCount: menu.sourcePhotoCandidates.length,
          reusableSourcePhotoCount: reusablePhotoItemIds.size,
          generationCandidateCount: imageContexts.length,
        },
        stages: [extraction.metadata, translation.metadata],
      });
    } catch (error) {
      cases.push({
        caseId: fixture.id,
        passed: false,
        failure: { code: failureCode(error) },
      });
    }
  }

  const imageComparisons: LiveBenchmarkImageReport[] = [];
  const imageContext = generationContexts[0];
  if (!imageContext) {
    imageComparisons.push(
      {
        quality: "low",
        passed: false,
        failure: { code: "generation_candidate_missing" },
      },
      {
        quality: "medium",
        passed: false,
        failure: { code: "generation_candidate_missing" },
      },
    );
  } else {
    for (const quality of ["low", "medium"] as const) {
      try {
        const reservation = budget.reserve(
          quality === "low"
            ? liveBenchmarkReservationsUsd.imageLow
            : liveBenchmarkReservationsUsd.imageMedium,
        );
        callCounts.generateDishImage += 1;
        const provider =
          quality === "low"
            ? options.providers.imageLow
            : options.providers.imageMedium;
        const generated = await provider.generateDishImage(imageContext);
        budget.complete(reservation, generated.metadata.estimatedCostUsd);
        try {
          await options.saveImage(quality, generated.data);
        } catch {
          throw new LiveBenchmarkError("artifact_write_failed");
        }
        imageComparisons.push({
          quality,
          passed: true,
          stage: generated.metadata,
        });
      } catch (error) {
        imageComparisons.push({
          quality,
          passed: false,
          failure: { code: failureCode(error) },
        });
      }
    }
  }

  const completedCaseCosts = cases
    .map((benchmarkCase) =>
      benchmarkCase.stages
        ? sum(benchmarkCase.stages.map((stage) => stage.estimatedCostUsd))
        : null,
    )
    .filter((value): value is number => value !== null);
  const mediumImageCost = imageComparisons.find(
    (comparison) => comparison.quality === "medium",
  )?.stage?.estimatedCostUsd;
  const projectedTypicalMenuCostUsd =
    completedCaseCosts.length > 0 && mediumImageCost !== undefined
      ? roundUsd(Math.max(...completedCaseCosts) + 40 * mediumImageCost)
      : null;
  const passesTwoDollarTarget =
    projectedTypicalMenuCostUsd !== null &&
    projectedTypicalMenuCostUsd <= maximumLiveBenchmarkSpendUsd;
  const budgetSnapshot = budget.snapshot();
  const passed =
    cases.every((benchmarkCase) => benchmarkCase.passed) &&
    imageComparisons.every((comparison) => comparison.passed) &&
    passesTwoDollarTarget &&
    !budgetSnapshot.reservationBreached &&
    callCounts.extractMenu <= 2 &&
    callCounts.translateMenu <= 2 &&
    callCounts.generateDishImage <= 2;

  return {
    schemaVersion: "1",
    passed,
    pricingBasis: "measured_provider_usage",
    models: {
      text: options.textModel,
      image: options.imageModel,
    },
    budget: budgetSnapshot,
    callCounts,
    cases,
    imageComparisons,
    projection: {
      typicalEligibleItemCount: 40,
      projectedTypicalMenuCostUsd,
      passesTwoDollarTarget,
    },
  };
}

export function validateLiveBenchmarkOptions(
  args: string[],
  apiKey: string | undefined,
) {
  let confirmed = false;
  let maxUsd: number | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      continue;
    }
    if (argument === "--confirm-spend") {
      confirmed = true;
      continue;
    }
    if (argument === "--max-usd") {
      maxUsd = Number(args[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`Unknown live benchmark option: ${argument}`);
  }
  if (!confirmed) {
    throw new Error("Live benchmark requires --confirm-spend");
  }
  if (!apiKey) {
    throw new Error("Live benchmark requires OPENAI_API_KEY");
  }
  if (
    maxUsd === undefined ||
    !Number.isFinite(maxUsd) ||
    maxUsd <= 0 ||
    maxUsd > maximumLiveBenchmarkSpendUsd
  ) {
    throw new Error("--max-usd must be greater than 0 and no more than 2");
  }
  return { apiKey, maxUsd };
}

export function assertFixtureHash(content: Uint8Array, expectedSha256: string) {
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error("Live benchmark fixture hash mismatch");
  }
}

function failureCode(error: unknown): LiveBenchmarkFailureCode {
  return error instanceof LiveBenchmarkError
    ? error.code
    : "provider_call_failed";
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function roundUsd(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
