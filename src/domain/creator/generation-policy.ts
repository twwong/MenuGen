import type { MenuExtractionV2 } from "@/domain/menu/menu-extraction";
import { isConfidentUsableSourcePhoto } from "@/pipeline/menu-pipeline";

export type GenerationDisposition =
  "reuse_source_photo" | "generate" | "not_eligible" | "needs_review";

export interface GenerationPlanItem {
  itemId: string;
  disposition: GenerationDisposition;
  sourcePhotoCandidateId: string | null;
}

export function buildGenerationPlan(
  menu: MenuExtractionV2,
): readonly GenerationPlanItem[] {
  const reusableByItem = new Map(
    menu.sourcePhotoCandidates
      .filter(isConfidentUsableSourcePhoto)
      .map((candidate) => [candidate.association.itemId!, candidate.id]),
  );
  return menu.sections.flatMap((section) =>
    section.items.map((item) => {
      const sourcePhotoCandidateId = reusableByItem.get(item.id) ?? null;
      if (sourcePhotoCandidateId) {
        return {
          itemId: item.id,
          disposition: "reuse_source_photo" as const,
          sourcePhotoCandidateId,
        };
      }
      if (item.imageEligibility === "needs_review") {
        return {
          itemId: item.id,
          disposition: "needs_review" as const,
          sourcePhotoCandidateId: null,
        };
      }
      if (
        item.imageEligibility === "prepared_food" ||
        item.imageEligibility === "prepared_drink"
      ) {
        return {
          itemId: item.id,
          disposition: "generate" as const,
          sourcePhotoCandidateId: null,
        };
      }
      return {
        itemId: item.id,
        disposition: "not_eligible" as const,
        sourcePhotoCandidateId: null,
      };
    }),
  );
}

export function chunkForGeneration<T>(
  values: readonly T[],
  concurrency = 4,
): T[][] {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("invalid_generation_concurrency");
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += concurrency) {
    chunks.push(values.slice(index, index + concurrency));
  }
  return chunks;
}

export class CostCeilingError extends Error {
  constructor() {
    super("generation_cost_ceiling");
    this.name = "CostCeilingError";
  }
}

export class MenuCostGuard {
  private reservedUsd = 0;

  constructor(
    private readonly warningUsd = 1.5,
    private readonly hardLimitUsd = 2,
  ) {
    if (warningUsd <= 0 || warningUsd >= hardLimitUsd || hardLimitUsd > 2) {
      throw new Error("invalid_cost_limits");
    }
  }

  reserve(amountUsd: number) {
    if (!Number.isFinite(amountUsd) || amountUsd < 0) {
      throw new Error("invalid_cost_reservation");
    }
    if (this.reservedUsd + amountUsd > this.hardLimitUsd) {
      throw new CostCeilingError();
    }
    this.reservedUsd += amountUsd;
    return {
      reservedUsd: this.reservedUsd,
      warning: this.reservedUsd >= this.warningUsd,
    };
  }
}

export type ProviderFailureKind =
  | "timeout"
  | "rate_limit"
  | "provider_5xx"
  | "schema"
  | "moderation"
  | "provider_4xx";

export class GenerationProviderError extends Error {
  constructor(
    readonly kind: ProviderFailureKind,
    readonly sanitizedCode: string,
  ) {
    super(sanitizedCode);
    this.name = "GenerationProviderError";
  }
}

export function isTransientGenerationFailure(error: unknown): boolean {
  return (
    error instanceof GenerationProviderError &&
    ["timeout", "rate_limit", "provider_5xx"].includes(error.kind)
  );
}

export async function withGenerationRetries<T>(input: {
  operation: (attempt: number) => Promise<T>;
  sleep: (milliseconds: number) => Promise<void>;
  random?: () => number;
  maximumRetries?: number;
}): Promise<T> {
  const maximumRetries = input.maximumRetries ?? 2;
  if (maximumRetries < 0 || maximumRetries > 2) {
    throw new Error("invalid_generation_retry_limit");
  }
  const random = input.random ?? Math.random;
  for (let attempt = 0; attempt <= maximumRetries; attempt += 1) {
    try {
      return await input.operation(attempt);
    } catch (error) {
      if (!isTransientGenerationFailure(error) || attempt === maximumRetries) {
        throw error;
      }
      const base = 500 * 2 ** attempt;
      await input.sleep(base + Math.floor(random() * 250));
    }
  }
  throw new Error("unreachable_retry_state");
}

export function assertRegenerationAllowed(currentCount: number, maximum = 2) {
  if (!Number.isInteger(currentCount) || currentCount < 0) {
    throw new Error("invalid_regeneration_count");
  }
  if (currentCount >= maximum) throw new Error("regeneration_limit_reached");
}
