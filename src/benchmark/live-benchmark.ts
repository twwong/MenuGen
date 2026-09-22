import { createHash } from "node:crypto";
import { assessMenuConfidence } from "@/domain/menu/confidence-policy";
import {
  menuSourceExtractionV2Schema,
  type MenuExtractionV2,
  type MenuSourceExtractionV2,
  type TargetLanguage,
} from "@/domain/menu/menu-extraction";
import { buildDishImageContext } from "@/pipeline/image-prompt";
import { isConfidentUsableSourcePhoto } from "@/pipeline/menu-pipeline";
import { mergeMenuTranslation } from "@/pipeline/merge-menu-translation";
import type {
  AiProviderSuite,
  GeneratedImage,
  MenuSourceInput,
  ProviderMetadata,
} from "@/providers/contracts";

export type LiveBenchmarkProfile = "full" | "photo-association";

export const maximumLiveBenchmarkSpendUsd = 2;
export const maximumPhotoAssociationBenchmarkSpendUsd = 0.75;
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

interface LiveBenchmarkReportBase {
  schemaVersion: "2";
  passed: boolean;
  pricingBasis: "measured_provider_usage";
  budget: LiveBenchmarkBudgetReport;
  callCounts: LiveBenchmarkCallCounts;
  cases: LiveBenchmarkCaseReport[];
}

export interface LiveBenchmarkFullReport extends LiveBenchmarkReportBase {
  profile: "full";
  models: { text: string; image: string };
  imageComparisons: LiveBenchmarkImageReport[];
  projection: {
    typicalEligibleItemCount: 40;
    projectedTypicalMenuCostUsd: number | null;
    passesTwoDollarTarget: boolean;
  };
}

export interface LivePhotoAssociationBenchmarkReport extends LiveBenchmarkReportBase {
  profile: "photo_association";
  models: { text: string };
}

export type LiveBenchmarkReport =
  LiveBenchmarkFullReport | LivePhotoAssociationBenchmarkReport;

interface LiveBenchmarkBudgetReport {
  maximumUsd: number;
  reservedUsd: number;
  actualEstimatedCostUsd: number;
  reservationBreached: boolean;
}

interface LiveBenchmarkCallCounts {
  extractMenu: number;
  translateMenu: number;
  generateDishImage: number;
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
  sourcePhotoDiagnostics?: SourcePhotoDiagnostics;
  stages?: ProviderMetadata[];
  failure?: { code: LiveBenchmarkFailureCode };
}

export interface SourcePhotoDiagnostics {
  candidateCount: number;
  reusableCount: number;
  expectedAssociationMatched: boolean;
  expectedReuseReady: boolean;
  reviewCounts: { region: number; association: number; usability: number };
  usabilityStatusCounts: {
    usable: number;
    unusable: number;
    uncertain: number;
  };
  minimumConfidence: {
    region: number | null;
    association: number | null;
    usability: number | null;
  };
  reasonCodes: SourcePhotoReasonCode[];
}

export type SourcePhotoReasonCode =
  | "no_candidate"
  | "expected_item_missing"
  | "expected_item_unassociated"
  | "associated_to_different_item"
  | "region_below_threshold"
  | "region_requires_review"
  | "association_below_threshold"
  | "association_requires_review"
  | "usability_not_usable"
  | "usability_below_threshold"
  | "usability_requires_review";

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

  snapshot(): LiveBenchmarkBudgetReport {
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
}): Promise<LiveBenchmarkFullReport> {
  assertFixtureCount(options.fixtures);
  const budget = new LiveBudgetGuard(options.maxUsd);
  const callCounts = emptyCallCounts();
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
      const evaluation = evaluateMenu(menu, fixture);
      const expectedGeneratedItem = evaluation.itemsBySourceName.get(
        fixture.expectations.generatedImageSourceName,
      );
      if (expectedGeneratedItem) {
        const context = evaluation.imageContexts.find(
          (candidate) => candidate.itemId === expectedGeneratedItem.id,
        );
        if (context && "prompt" in context) generationContexts.push(context);
      }

      const checks = commonChecks(
        menu,
        fixture,
        evaluation,
        confidence.unflaggedLowConfidenceCount,
      );
      cases.push({
        caseId: fixture.id,
        passed: checks.every((check) => check.passed),
        checks,
        confidence,
        metrics: evaluation.metrics,
        sourcePhotoDiagnostics: evaluation.sourcePhotoDiagnostics,
        stages: [extraction.metadata, translation.metadata],
      });
    } catch (error) {
      cases.push(failedCase(fixture.id, error));
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

  return {
    schemaVersion: "2",
    profile: "full",
    passed:
      cases.every((benchmarkCase) => benchmarkCase.passed) &&
      imageComparisons.every((comparison) => comparison.passed) &&
      passesTwoDollarTarget &&
      callsWithinLimits(callCounts) &&
      !budgetSnapshot.reservationBreached,
    pricingBasis: "measured_provider_usage",
    models: { text: options.textModel, image: options.imageModel },
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

export async function runLivePhotoAssociationBenchmark(options: {
  fixtures: LiveBenchmarkFixture[];
  provider: AiProviderSuite;
  maxUsd: number;
  textModel: string;
}): Promise<LivePhotoAssociationBenchmarkReport> {
  assertFixtureCount(options.fixtures);
  if (options.maxUsd > maximumPhotoAssociationBenchmarkSpendUsd) {
    throw new Error("Photo-association benchmark cap cannot exceed $0.75");
  }

  const budget = new LiveBudgetGuard(options.maxUsd);
  const callCounts = emptyCallCounts();
  const cases: LiveBenchmarkCaseReport[] = [];

  for (const fixture of options.fixtures) {
    try {
      const reservation = budget.reserve(
        liveBenchmarkReservationsUsd.extractMenu,
      );
      callCounts.extractMenu += 1;
      const extraction = await options.provider.extractMenu(fixture.input);
      budget.complete(reservation, extraction.metadata.estimatedCostUsd);
      const menu = menuSourceExtractionV2Schema.parse(extraction.data);
      const evaluation = evaluateMenu(menu, fixture);
      const checks = commonChecks(
        menu,
        fixture,
        evaluation,
        countUnflaggedLowConfidenceFields(menu),
      );
      cases.push({
        caseId: fixture.id,
        passed: checks.every((check) => check.passed),
        checks,
        metrics: evaluation.metrics,
        sourcePhotoDiagnostics: evaluation.sourcePhotoDiagnostics,
        stages: [extraction.metadata],
      });
    } catch (error) {
      cases.push(failedCase(fixture.id, error));
    }
  }

  const budgetSnapshot = budget.snapshot();
  return {
    schemaVersion: "2",
    profile: "photo_association",
    passed:
      cases.every((benchmarkCase) => benchmarkCase.passed) &&
      callCounts.extractMenu <= 2 &&
      callCounts.translateMenu === 0 &&
      callCounts.generateDishImage === 0 &&
      !budgetSnapshot.reservationBreached,
    pricingBasis: "measured_provider_usage",
    models: { text: options.textModel },
    budget: budgetSnapshot,
    callCounts,
    cases,
  };
}

export function validateLiveBenchmarkOptions(
  args: string[],
  apiKey: string | undefined,
) {
  let confirmed = false;
  let maxUsd: number | undefined;
  let profile: LiveBenchmarkProfile = "full";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--confirm-spend") {
      confirmed = true;
      continue;
    }
    if (argument === "--max-usd") {
      maxUsd = Number(args[index + 1]);
      index += 1;
      continue;
    }
    if (argument === "--profile") {
      const value = args[index + 1];
      if (value !== "full" && value !== "photo-association") {
        throw new Error("--profile must be full or photo-association");
      }
      profile = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown live benchmark option: ${argument}`);
  }
  if (!confirmed) throw new Error("Live benchmark requires --confirm-spend");
  if (!apiKey) throw new Error("Live benchmark requires OPENAI_API_KEY");
  const maximumUsd =
    profile === "photo-association"
      ? maximumPhotoAssociationBenchmarkSpendUsd
      : maximumLiveBenchmarkSpendUsd;
  if (
    maxUsd === undefined ||
    !Number.isFinite(maxUsd) ||
    maxUsd <= 0 ||
    maxUsd > maximumUsd
  ) {
    throw new Error(
      `--max-usd must be greater than 0 and no more than ${maximumUsd}`,
    );
  }
  return { apiKey, maxUsd, profile };
}

export function assertFixtureHash(content: Uint8Array, expectedSha256: string) {
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error("Live benchmark fixture hash mismatch");
  }
}

type EvaluatedMenu = MenuSourceExtractionV2 | MenuExtractionV2;
type EvaluatedItem = EvaluatedMenu["sections"][number]["items"][number];
type TranslatedMenuItem = MenuExtractionV2["sections"][number]["items"][number];

function evaluateMenu(menu: EvaluatedMenu, fixture: LiveBenchmarkFixture) {
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
    .map((item) =>
      isTranslatedMenuItem(item)
        ? buildDishImageContext(item)
        : { itemId: item.id, sourceName: item.name.sourceText },
    );
  const diagnostics = sourcePhotoDiagnostics(
    menu,
    fixture.expectations.sourcePhotoSourceName,
  );
  return {
    items,
    itemsBySourceName,
    imageContexts,
    sourcePhotoDiagnostics: diagnostics,
    metrics: {
      itemCount: items.length,
      sourcePhotoCandidateCount: menu.sourcePhotoCandidates.length,
      reusableSourcePhotoCount: reusablePhotoItemIds.size,
      generationCandidateCount: imageContexts.length,
    },
  };
}

function isTranslatedMenuItem(item: EvaluatedItem): item is TranslatedMenuItem {
  return "translatedText" in item.name;
}

function commonChecks(
  menu: EvaluatedMenu,
  fixture: LiveBenchmarkFixture,
  evaluation: ReturnType<typeof evaluateMenu>,
  unflaggedLowConfidenceCount: number,
) {
  const serializedMenu = JSON.stringify(menu).toLocaleLowerCase("en");
  const expectedGeneratedItem = evaluation.itemsBySourceName.get(
    fixture.expectations.generatedImageSourceName,
  );
  const generatedItemRemainsEligible = expectedGeneratedItem
    ? evaluation.imageContexts.some(
        (candidate) => candidate.itemId === expectedGeneratedItem.id,
      ) &&
      !menu.sourcePhotoCandidates.some(
        (candidate) =>
          candidate.association.itemId === expectedGeneratedItem.id,
      )
    : false;

  return [
    {
      name: "source order preserved",
      passed:
        JSON.stringify(evaluation.items.map((item) => item.name.sourceText)) ===
        JSON.stringify(fixture.expectations.orderedSourceNames),
    },
    {
      name: "price text preserved",
      passed: Object.entries(fixture.expectations.priceTextBySourceName).every(
        ([sourceName, priceText]) =>
          evaluation.itemsBySourceName.get(sourceName)?.price?.sourceText ===
          priceText,
      ),
    },
    {
      name: "ambiguous price flagged",
      passed:
        evaluation.itemsBySourceName.get(
          fixture.expectations.reviewPriceSourceName,
        )?.price?.needsReview === true,
    },
    {
      name: "source photo confidently associated",
      passed: evaluation.sourcePhotoDiagnostics.expectedReuseReady,
    },
    {
      name: "source photo suppresses generation",
      passed:
        evaluation.sourcePhotoDiagnostics.expectedReuseReady &&
        !evaluation.imageContexts.some(
          (context) =>
            context.sourceName === fixture.expectations.sourcePhotoSourceName,
        ),
    },
    {
      name: "text-only item remains generation eligible",
      passed: generatedItemRemainsEligible,
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
      passed: unflaggedLowConfidenceCount === 0,
    },
  ];
}

function sourcePhotoDiagnostics(
  menu: EvaluatedMenu,
  expectedSourceName: string,
): SourcePhotoDiagnostics {
  const candidates = menu.sourcePhotoCandidates;
  const items = menu.sections.flatMap((section) => section.items);
  const expectedItem = items.find(
    (item) => item.name.sourceText === expectedSourceName,
  );
  const expectedCandidate =
    candidates.find(
      (candidate) => candidate.association.itemId === expectedItem?.id,
    ) ?? candidates[0];
  const reasonCodes: SourcePhotoReasonCode[] = [];

  if (!expectedItem) reasonCodes.push("expected_item_missing");
  if (!expectedCandidate) {
    reasonCodes.push("no_candidate");
  } else {
    if (expectedCandidate.association.itemId === null) {
      reasonCodes.push("expected_item_unassociated");
    } else if (expectedCandidate.association.itemId !== expectedItem?.id) {
      reasonCodes.push("associated_to_different_item");
    }
    addFieldReasons(
      reasonCodes,
      expectedCandidate.region,
      "region_below_threshold",
      "region_requires_review",
    );
    addFieldReasons(
      reasonCodes,
      expectedCandidate.association,
      "association_below_threshold",
      "association_requires_review",
    );
    if (expectedCandidate.usability.status !== "usable") {
      reasonCodes.push("usability_not_usable");
    }
    addFieldReasons(
      reasonCodes,
      expectedCandidate.usability,
      "usability_below_threshold",
      "usability_requires_review",
    );
  }

  return {
    candidateCount: candidates.length,
    reusableCount: candidates.filter(isConfidentUsableSourcePhoto).length,
    expectedAssociationMatched:
      expectedItem !== undefined &&
      expectedCandidate?.association.itemId === expectedItem.id,
    expectedReuseReady:
      expectedItem !== undefined &&
      expectedCandidate?.association.itemId === expectedItem.id &&
      isConfidentUsableSourcePhoto(expectedCandidate),
    reviewCounts: {
      region: countReviewFields(
        candidates.map((candidate) => candidate.region),
      ),
      association: countReviewFields(
        candidates.map((candidate) => candidate.association),
      ),
      usability: countReviewFields(
        candidates.map((candidate) => candidate.usability),
      ),
    },
    usabilityStatusCounts: {
      usable: candidates.filter(
        (candidate) => candidate.usability.status === "usable",
      ).length,
      unusable: candidates.filter(
        (candidate) => candidate.usability.status === "unusable",
      ).length,
      uncertain: candidates.filter(
        (candidate) => candidate.usability.status === "uncertain",
      ).length,
    },
    minimumConfidence: {
      region: minimum(
        candidates.map((candidate) => candidate.region.confidence),
      ),
      association: minimum(
        candidates.map((candidate) => candidate.association.confidence),
      ),
      usability: minimum(
        candidates.map((candidate) => candidate.usability.confidence),
      ),
    },
    reasonCodes: [...new Set(reasonCodes)],
  };
}

function addFieldReasons(
  reasons: SourcePhotoReasonCode[],
  field: { confidence: number; needsReview: boolean },
  lowCode: SourcePhotoReasonCode,
  reviewCode: SourcePhotoReasonCode,
) {
  if (field.confidence < 0.85) reasons.push(lowCode);
  if (field.needsReview) reasons.push(reviewCode);
}

function countReviewFields(
  fields: Array<{ confidence: number; needsReview: boolean }>,
) {
  return fields.filter((field) => field.needsReview || field.confidence < 0.85)
    .length;
}

function countUnflaggedLowConfidenceFields(menu: MenuSourceExtractionV2) {
  const fields = [
    ...(menu.title ? [menu.title] : []),
    ...menu.sections.flatMap((section) => [
      section.title,
      ...section.items.flatMap((item) => [
        item.name,
        ...(item.description ? [item.description] : []),
        ...(item.price ? [item.price] : []),
      ]),
    ]),
    ...menu.sourcePhotoCandidates.flatMap((candidate) => [
      candidate.region,
      candidate.association,
      candidate.usability,
    ]),
  ];
  return fields.filter((field) => field.confidence < 0.85 && !field.needsReview)
    .length;
}

function minimum(values: number[]) {
  return values.length > 0 ? Math.min(...values) : null;
}

function emptyCallCounts(): LiveBenchmarkCallCounts {
  return { extractMenu: 0, translateMenu: 0, generateDishImage: 0 };
}

function callsWithinLimits(callCounts: LiveBenchmarkCallCounts) {
  return (
    callCounts.extractMenu <= 2 &&
    callCounts.translateMenu <= 2 &&
    callCounts.generateDishImage <= 2
  );
}

function assertFixtureCount(fixtures: LiveBenchmarkFixture[]) {
  if (fixtures.length === 0 || fixtures.length > 2) {
    throw new Error("Live benchmark requires one or two fixtures");
  }
}

function failedCase(caseId: string, error: unknown): LiveBenchmarkCaseReport {
  return {
    caseId,
    passed: false,
    failure: { code: failureCode(error) },
  };
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
