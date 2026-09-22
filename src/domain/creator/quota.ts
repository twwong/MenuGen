import { z } from "zod";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

export const quotaEntrySchema = z
  .object({
    id: uuidSchema,
    userId: z.string().min(1),
    menuId: uuidSchema,
    reservationId: uuidSchema,
    kind: z.enum(["reservation", "consumption", "release", "adjustment"]),
    amount: z.number().int().min(-3).max(3),
    businessKey: z.string().min(1).max(180),
    occurredAt: timestampSchema,
    reasonCode: z.string().min(1).max(80),
  })
  .strict();

export type QuotaEntry = z.infer<typeof quotaEntrySchema>;

export interface QuotaSummary {
  limit: number;
  consumed: number;
  reserved: number;
  remaining: number;
  nextResetAt: string | null;
}

export function summarizeRollingQuota(
  entries: readonly QuotaEntry[],
  now: Date,
  limit = 3,
  windowDays = 30,
): QuotaSummary {
  const windowStart = new Date(now);
  windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);

  const currentEntries = entries
    .map((entry) => quotaEntrySchema.parse(entry))
    .filter((entry) => {
      const occurredAt = new Date(entry.occurredAt);
      return occurredAt > windowStart && occurredAt <= now;
    });

  const reservationStates = new Map<
    string,
    { reserved: boolean; consumed: boolean; released: boolean; at: Date }
  >();
  let adjustments = 0;

  for (const entry of currentEntries) {
    if (entry.kind === "adjustment") {
      adjustments += entry.amount;
      continue;
    }
    const state = reservationStates.get(entry.reservationId) ?? {
      reserved: false,
      consumed: false,
      released: false,
      at: new Date(entry.occurredAt),
    };
    if (entry.kind === "reservation") state.reserved = true;
    if (entry.kind === "consumption") {
      state.consumed = true;
      state.at = new Date(entry.occurredAt);
    }
    if (entry.kind === "release") state.released = true;
    reservationStates.set(entry.reservationId, state);
  }

  const states = [...reservationStates.values()];
  const consumed = states.filter((state) => state.consumed).length;
  const reserved = states.filter(
    (state) => state.reserved && !state.consumed && !state.released,
  ).length;
  const used = Math.max(0, consumed + reserved + adjustments);
  const resetCandidates = states
    .filter((state) => state.consumed)
    .map((state) => {
      const resetAt = new Date(state.at);
      resetAt.setUTCDate(resetAt.getUTCDate() + windowDays);
      return resetAt;
    })
    .sort((left, right) => left.getTime() - right.getTime());

  return {
    limit,
    consumed,
    reserved,
    remaining: Math.max(0, limit - used),
    nextResetAt: resetCandidates[0]?.toISOString() ?? null,
  };
}
