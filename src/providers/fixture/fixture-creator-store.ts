import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SafeMenuDetail, SafeMenuSummary } from "@/application/contracts";
import { collectReviewIssues } from "@/application/review-issues";
import { ownershipTokenMatches } from "@/application/ownership";
import {
  assertRegenerationAllowed,
  buildGenerationPlan,
  MenuCostGuard,
} from "@/domain/creator/generation-policy";
import {
  quotaEntrySchema,
  summarizeRollingQuota,
  type QuotaEntry,
  type QuotaSummary,
} from "@/domain/creator/quota";
import {
  createRevisedDraft,
  menuDraftV1Schema,
  type MenuDraftV1,
  type ReviewPatch,
  type ReviewResolution,
} from "@/domain/creator/revisions";
import {
  assertMenuTransition,
  type ItemState,
  type MenuState,
} from "@/domain/creator/state";
import type { TargetLanguage } from "@/domain/menu/menu-extraction";
import { createCreatorMenuFixture } from "@/providers/fixture/creator-menu-fixture";

interface FixtureMenuRecord {
  id: string;
  anonymousTokenHash: string | null;
  userId: string | null;
  targetLanguage: TargetLanguage;
  state: MenuState;
  currentRevision: MenuDraftV1;
  generationRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  itemStates: Map<string, ItemState>;
  itemProvenance: Map<string, "source" | "generated" | "unavailable" | null>;
  itemErrorCodes: Map<string, string | null>;
  regenerationCounts: Map<string, number>;
  quotaEntries: QuotaEntry[];
  reservationId: string | null;
  providerRequestStarted: boolean;
  estimatedCostUsd: number;
  sourceDeletedAt: string;
  completionEmailEventKey: string | null;
  completionEmailSentAt: string | null;
}

interface StoredFixtureMenuRecord extends Omit<
  FixtureMenuRecord,
  "itemStates" | "itemProvenance" | "itemErrorCodes" | "regenerationCounts"
> {
  itemStates: Array<[string, ItemState]>;
  itemProvenance: Array<
    [string, "source" | "generated" | "unavailable" | null]
  >;
  itemErrorCodes: Array<[string, string | null]>;
  regenerationCounts: Array<[string, number]>;
}

export interface FixtureGenerationItem {
  itemId: string;
  state: ItemState;
  provenance: "source" | "generated" | "unavailable" | null;
  sanitizedErrorCode: string | null;
  regenerationCount: number;
}

export interface FixtureGenerationView {
  menu: SafeMenuDetail;
  items: readonly FixtureGenerationItem[];
  quota: QuotaSummary | null;
  estimatedCostUsd: number;
  completionEmailSent: boolean;
}

export interface FixtureDeletionAudit {
  menuId: string;
  ownerUserId: string | null;
  reason: "user_request" | "expiration";
  deletedAt: string;
  tombstoneExpiresAt: string;
  sourceObjectCount: number;
  resultObjectCount: number;
  sanitizedResult: "deleted";
}

declare global {
  var __menugenFixtureStore: Map<string, FixtureMenuRecord> | undefined;
  var __menugenFixtureGenerationRuns: Set<string> | undefined;
}

const store = (globalThis.__menugenFixtureStore ??= new Map());
const activeGenerationRuns = (globalThis.__menugenFixtureGenerationRuns ??=
  new Set());
const fixtureDirectory = join(
  tmpdir(),
  `menugen-fixture-creator-${process.env.PORT ?? "local"}`,
);

export function createFixtureDraft(input: {
  menuId: string;
  anonymousTokenHash: string;
  targetLanguage: TargetLanguage;
  now: string;
}): SafeMenuDetail {
  const menu = createCreatorMenuFixture(input.targetLanguage);
  const revision = menuDraftV1Schema.parse({
    schemaVersion: "1",
    menuId: input.menuId,
    revisionId: randomUUID(),
    revisionNumber: 1,
    basedOnRevisionId: null,
    createdAt: input.now,
    menu,
    corrections: [],
    reviewResolutions: [],
  });
  const record: FixtureMenuRecord = {
    id: input.menuId,
    anonymousTokenHash: input.anonymousTokenHash,
    userId: null,
    targetLanguage: input.targetLanguage,
    state: "review_ready",
    currentRevision: revision,
    generationRevisionId: null,
    createdAt: input.now,
    updatedAt: input.now,
    expiresAt: null,
    itemStates: new Map(
      menu.sections.flatMap((section) =>
        section.items.map((item) => [item.id, "pending" as const]),
      ),
    ),
    itemProvenance: new Map(
      menu.sections.flatMap((section) =>
        section.items.map((item) => [item.id, null]),
      ),
    ),
    itemErrorCodes: new Map(
      menu.sections.flatMap((section) =>
        section.items.map((item) => [item.id, null]),
      ),
    ),
    regenerationCounts: new Map(
      menu.sections.flatMap((section) =>
        section.items.map((item) => [item.id, 0]),
      ),
    ),
    quotaEntries: [],
    reservationId: null,
    providerRequestStarted: false,
    estimatedCostUsd: 0,
    sourceDeletedAt: input.now,
    completionEmailEventKey: null,
    completionEmailSentAt: null,
  };
  store.set(record.id, record);
  persistRecord(record);
  return toDetail(record);
}

export function getOwnedFixtureMenu(input: {
  menuId: string;
  anonymousToken: string | null;
  userId: string | null;
}): SafeMenuDetail | null {
  const record = getRecord(input.menuId);
  if (!record || !isOwner(record, input)) return null;
  return toDetail(record);
}

export function listOwnedFixtureMenus(input: {
  anonymousToken: string | null;
  userId: string | null;
}): SafeMenuSummary[] {
  return getAllRecords()
    .filter((record) => isOwner(record, input))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(toSummary);
}

export function reviseFixtureMenu(input: {
  menuId: string;
  anonymousToken: string | null;
  userId: string | null;
  previousRevisionId: string;
  patches: readonly ReviewPatch[];
  resolutions: readonly ReviewResolution[];
  now: string;
}): MenuDraftV1 {
  const record = getRecord(input.menuId);
  if (!record || !isOwner(record, input)) throw new Error("menu_not_found");
  if (record.state !== "review_ready") throw new Error("menu_not_editable");
  if (record.currentRevision.revisionId !== input.previousRevisionId) {
    throw new Error("revision_conflict");
  }
  record.currentRevision = createRevisedDraft({
    previous: record.currentRevision,
    revisionId: randomUUID(),
    createdAt: input.now,
    patches: input.patches,
    resolutions: input.resolutions,
  });
  record.updatedAt = input.now;
  persistRecord(record);
  return structuredClone(record.currentRevision);
}

export function transitionFixtureMenu(input: {
  menuId: string;
  anonymousToken: string | null;
  userId: string | null;
  expected: MenuState;
  next: MenuState;
  now: string;
}): boolean {
  const record = getRecord(input.menuId);
  if (!record || !isOwner(record, input) || record.state !== input.expected) {
    return false;
  }
  assertMenuTransition(input.expected, input.next);
  record.state = input.next;
  record.updatedAt = input.now;
  persistRecord(record);
  return true;
}

export function claimFixtureMenu(input: {
  menuId: string;
  anonymousToken: string;
  userId: string;
  now: string;
}): boolean {
  const record = getRecord(input.menuId);
  if (
    !record ||
    record.userId !== null ||
    !record.anonymousTokenHash ||
    !ownershipTokenMatches(input.anonymousToken, record.anonymousTokenHash)
  ) {
    return false;
  }
  record.userId = input.userId;
  record.anonymousTokenHash = null;
  record.updatedAt = input.now;
  persistRecord(record);
  return true;
}

export function getFixtureGenerationView(input: {
  menuId: string;
  anonymousToken: string | null;
  userId: string | null;
  now?: Date;
}): FixtureGenerationView | null {
  const record = getRecord(input.menuId);
  if (!record || !isOwner(record, input)) return null;
  return {
    menu: toDetail(record),
    items: [...record.itemStates.entries()].map(([itemId, state]) => ({
      itemId,
      state,
      provenance: record.itemProvenance.get(itemId) ?? null,
      sanitizedErrorCode: record.itemErrorCodes.get(itemId) ?? null,
      regenerationCount: record.regenerationCounts.get(itemId) ?? 0,
    })),
    quota: record.userId
      ? fixtureQuotaSummary(record.userId, input.now ?? new Date())
      : null,
    estimatedCostUsd: record.estimatedCostUsd,
    completionEmailSent: record.completionEmailSentAt !== null,
  };
}

export function getFixtureDashboard(input: { userId: string; now?: Date }) {
  return {
    menus: listOwnedFixtureMenus({
      anonymousToken: null,
      userId: input.userId,
    }),
    quota: fixtureQuotaSummary(input.userId, input.now ?? new Date()),
  };
}

export function reserveAndStartFixtureGeneration(input: {
  menuId: string;
  userId: string;
  now: string;
}): { reservationId: string | null; generationItemCount: number } {
  const record = getRecord(input.menuId);
  if (!record || record.userId !== input.userId)
    throw new Error("menu_not_found");
  if (record.state !== "generation_ready") {
    if (record.state === "generating" || record.state === "ready") {
      return {
        reservationId: record.reservationId,
        generationItemCount: [...record.itemStates.values()].filter((state) =>
          ["generation_eligible", "generating", "generated", "failed"].includes(
            state,
          ),
        ).length,
      };
    }
    throw new Error("menu_not_ready_for_generation");
  }

  const plan = buildGenerationPlan(record.currentRevision.menu);
  for (const item of plan) {
    if (item.disposition === "reuse_source_photo") {
      record.itemStates.set(item.itemId, "source_photo_ready");
      record.itemProvenance.set(item.itemId, "source");
    } else if (item.disposition === "generate") {
      record.itemStates.set(item.itemId, "generation_eligible");
    } else {
      record.itemStates.set(item.itemId, "not_eligible");
    }
  }
  const generationItemCount = plan.filter(
    (item) => item.disposition === "generate",
  ).length;
  record.generationRevisionId = record.currentRevision.revisionId;
  assertMenuTransition("generation_ready", "generating");
  record.state = "generating";

  if (generationItemCount > 0) {
    const quota = fixtureQuotaSummary(record.userId, new Date(input.now));
    if (quota.remaining < 1) throw new Error("quota_exhausted");
    const reservationId = randomUUID();
    record.reservationId = reservationId;
    record.quotaEntries.push(
      quotaEntrySchema.parse({
        id: randomUUID(),
        userId: record.userId,
        menuId: record.id,
        reservationId,
        kind: "reservation",
        amount: 1,
        businessKey: `menu:${record.id}:reservation`,
        occurredAt: input.now,
        reasonCode: "initial_generation",
      }),
    );
  } else {
    assertMenuTransition("generating", "ready");
    record.state = "ready";
    record.expiresAt = addDays(new Date(input.now), 30).toISOString();
  }
  record.updatedAt = input.now;
  persistRecord(record);
  return { reservationId: record.reservationId, generationItemCount };
}

export async function runFixtureGeneration(
  menuId: string,
  options: { delayMs?: number } = {},
): Promise<void> {
  if (activeGenerationRuns.has(menuId)) return;
  const initial = getRecord(menuId);
  if (!initial || initial.state !== "generating") return;
  activeGenerationRuns.add(menuId);
  try {
    await runFixtureGenerationOnce(menuId, options.delayMs ?? 350);
  } finally {
    activeGenerationRuns.delete(menuId);
  }
}

export function releaseFixtureGenerationReservation(input: {
  menuId: string;
  userId: string;
  now: string;
  reasonCode: string;
}): boolean {
  const record = getRecord(input.menuId);
  if (!record || record.userId !== input.userId)
    throw new Error("menu_not_found");
  if (
    record.state !== "generating" ||
    record.providerRequestStarted ||
    !record.reservationId
  ) {
    return false;
  }
  record.quotaEntries.push(
    quotaEntrySchema.parse({
      id: randomUUID(),
      userId: record.userId,
      menuId: record.id,
      reservationId: record.reservationId,
      kind: "release",
      amount: -1,
      businessKey: `menu:${record.id}:release`,
      occurredAt: input.now,
      reasonCode: input.reasonCode,
    }),
  );
  assertMenuTransition("generating", "failed");
  record.state = "failed";
  record.updatedAt = input.now;
  persistRecord(record);
  return true;
}

async function runFixtureGenerationOnce(
  menuId: string,
  delayMs: number,
): Promise<void> {
  const initial = getRecord(menuId);
  if (!initial || initial.state !== "generating") return;
  const generatedIds = [...initial.itemStates.entries()]
    .filter(([, state]) => state === "generation_eligible")
    .map(([itemId]) => itemId);
  const costGuard = new MenuCostGuard();

  for (const itemId of generatedIds) {
    await delay(delayMs);
    const record = getRecord(menuId);
    if (!record || record.state !== "generating") return;
    costGuard.reserve(0.02);
    if (!record.providerRequestStarted) {
      consumeFixtureReservation(record, new Date().toISOString());
    }
    record.itemStates.set(itemId, "generating");
    record.estimatedCostUsd += 0.02;
    record.updatedAt = new Date().toISOString();
    persistRecord(record);

    await delay(delayMs);
    const updated = getRecord(menuId);
    if (!updated || updated.state !== "generating") return;
    if (itemId === "tea") {
      updated.itemStates.set(itemId, "failed");
      updated.itemProvenance.set(itemId, "unavailable");
      updated.itemErrorCodes.set(itemId, "provider_content_rejected");
    } else {
      updated.itemStates.set(itemId, "generated");
      updated.itemProvenance.set(itemId, "generated");
    }
    updated.updatedAt = new Date().toISOString();
    persistRecord(updated);
  }

  const completed = getRecord(menuId);
  if (!completed || completed.state !== "generating") return;
  assertMenuTransition("generating", "ready");
  completed.state = "ready";
  completed.expiresAt = addDays(new Date(), 30).toISOString();
  completed.updatedAt = new Date().toISOString();
  recordFixtureCompletionEmail(completed, completed.updatedAt);
  persistRecord(completed);
}

export function regenerateFixtureItem(input: {
  menuId: string;
  itemId: string;
  userId: string;
  now: string;
}): void {
  const record = getRecord(input.menuId);
  if (!record || record.userId !== input.userId)
    throw new Error("menu_not_found");
  if (record.state !== "ready") throw new Error("menu_not_ready");
  const current = record.regenerationCounts.get(input.itemId);
  if (current === undefined) throw new Error("item_not_found");
  assertRegenerationAllowed(current);
  new MenuCostGuard().reserve(0.02);
  record.regenerationCounts.set(input.itemId, current + 1);
  record.itemStates.set(input.itemId, "generated");
  record.itemProvenance.set(input.itemId, "generated");
  record.itemErrorCodes.set(input.itemId, null);
  record.estimatedCostUsd += 0.02;
  record.updatedAt = input.now;
  persistRecord(record);
}

export function deleteFixtureMenu(input: {
  menuId: string;
  userId: string;
  now: string;
  reason: "user_request" | "expiration";
}): FixtureDeletionAudit {
  const existingAudit = getFixtureDeletionAudit(input.menuId);
  if (existingAudit) {
    if (existingAudit.ownerUserId !== input.userId)
      throw new Error("menu_not_found");
    return existingAudit;
  }
  const record = getRecord(input.menuId);
  if (!record || record.userId !== input.userId)
    throw new Error("menu_not_found");
  assertMenuTransition(record.state, "deleting");
  record.state = "deleting";
  persistRecord(record);
  assertMenuTransition("deleting", "deleted");
  const audit: FixtureDeletionAudit = {
    menuId: record.id,
    ownerUserId: record.userId,
    reason: input.reason,
    deletedAt: input.now,
    tombstoneExpiresAt: addDays(new Date(input.now), 90).toISOString(),
    sourceObjectCount: 0,
    resultObjectCount: [...record.itemProvenance.values()].filter(Boolean)
      .length,
    sanitizedResult: "deleted",
  };
  persistDeletionAudit(audit);
  store.delete(record.id);
  try {
    unlinkSync(recordPath(record.id));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return audit;
}

export function expireFixtureMenus(now: Date): readonly string[] {
  const expired: string[] = [];
  for (const record of getAllRecords()) {
    if (
      record.userId &&
      record.state === "ready" &&
      record.expiresAt &&
      new Date(record.expiresAt) <= now
    ) {
      deleteFixtureMenu({
        menuId: record.id,
        userId: record.userId,
        now: now.toISOString(),
        reason: "expiration",
      });
      expired.push(record.id);
    }
  }
  return expired;
}

export function getFixtureDeletionAudit(
  menuId: string,
): FixtureDeletionAudit | null {
  try {
    return JSON.parse(
      readFileSync(deletionAuditPath(menuId), "utf8"),
    ) as FixtureDeletionAudit;
  } catch {
    return null;
  }
}

export function pruneFixtureDeletionAudits(now: Date): number {
  const directory = join(fixtureDirectory, "tombstones");
  let deleted = 0;
  try {
    for (const name of readdirSync(directory)) {
      if (!name.endsWith(".json")) continue;
      const path = join(directory, name);
      const audit = JSON.parse(
        readFileSync(path, "utf8"),
      ) as FixtureDeletionAudit;
      if (new Date(audit.tombstoneExpiresAt) <= now) {
        unlinkSync(path);
        deleted += 1;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return deleted;
}

function getRecord(menuId: string): FixtureMenuRecord | undefined {
  try {
    const stored = JSON.parse(
      readFileSync(join(fixtureDirectory, `${menuId}.json`), "utf8"),
    ) as StoredFixtureMenuRecord;
    const record: FixtureMenuRecord = {
      ...stored,
      currentRevision: menuDraftV1Schema.parse(stored.currentRevision),
      itemStates: new Map(stored.itemStates),
      itemProvenance: new Map(stored.itemProvenance ?? []),
      itemErrorCodes: new Map(stored.itemErrorCodes ?? []),
      regenerationCounts: new Map(stored.regenerationCounts ?? []),
      quotaEntries: (stored.quotaEntries ?? []).map((entry) =>
        quotaEntrySchema.parse(entry),
      ),
      reservationId: stored.reservationId ?? null,
      providerRequestStarted: stored.providerRequestStarted ?? false,
      estimatedCostUsd: stored.estimatedCostUsd ?? 0,
      sourceDeletedAt: stored.sourceDeletedAt ?? stored.updatedAt,
      completionEmailEventKey: stored.completionEmailEventKey ?? null,
      completionEmailSentAt: stored.completionEmailSentAt ?? null,
    };
    store.set(menuId, record);
    return record;
  } catch {
    return store.get(menuId);
  }
}

function getAllRecords(): FixtureMenuRecord[] {
  try {
    mkdirSync(fixtureDirectory, { recursive: true, mode: 0o700 });
    return readdirSync(fixtureDirectory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => getRecord(name.slice(0, -5)))
      .filter((record): record is FixtureMenuRecord => Boolean(record));
  } catch {
    return [...store.values()];
  }
}

function persistRecord(record: FixtureMenuRecord): void {
  mkdirSync(fixtureDirectory, { recursive: true, mode: 0o700 });
  const destination = recordPath(record.id);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const stored: StoredFixtureMenuRecord = {
    ...record,
    itemStates: [...record.itemStates.entries()],
    itemProvenance: [...record.itemProvenance.entries()],
    itemErrorCodes: [...record.itemErrorCodes.entries()],
    regenerationCounts: [...record.regenerationCounts.entries()],
  };
  writeFileSync(temporary, JSON.stringify(stored), { mode: 0o600 });
  renameSync(temporary, destination);
}

function recordFixtureCompletionEmail(
  record: FixtureMenuRecord,
  occurredAt: string,
) {
  if (!record.userId || record.completionEmailEventKey) return;
  record.completionEmailEventKey = `menu:${record.id}:completion`;
  record.completionEmailSentAt = occurredAt;
}

function persistDeletionAudit(audit: FixtureDeletionAudit) {
  const directory = join(fixtureDirectory, "tombstones");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const destination = deletionAuditPath(audit.menuId);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(audit), { mode: 0o600 });
  renameSync(temporary, destination);
}

function recordPath(menuId: string) {
  return join(fixtureDirectory, `${menuId}.json`);
}

function deletionAuditPath(menuId: string) {
  return join(fixtureDirectory, "tombstones", `${menuId}.json`);
}

function isOwner(
  record: FixtureMenuRecord,
  actor: { anonymousToken: string | null; userId: string | null },
) {
  if (record.userId && actor.userId === record.userId) return true;
  return Boolean(
    record.anonymousTokenHash &&
    actor.anonymousToken &&
    ownershipTokenMatches(actor.anonymousToken, record.anonymousTokenHash),
  );
}

function toSummary(record: FixtureMenuRecord): SafeMenuSummary {
  const states = [...record.itemStates.values()];
  return {
    id: record.id,
    state: record.state,
    targetLanguage: record.targetLanguage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    expiresAt: record.expiresAt,
    issueCount: collectReviewIssues(record.currentRevision).length,
    completedItemCount: states.filter((state) =>
      ["source_photo_ready", "generated", "failed", "not_eligible"].includes(
        state,
      ),
    ).length,
    totalItemCount: states.length,
  };
}

function toDetail(record: FixtureMenuRecord): SafeMenuDetail {
  return {
    ...toSummary(record),
    currentRevision: structuredClone(record.currentRevision),
    generationRevisionId: record.generationRevisionId,
  };
}

function fixtureQuotaSummary(userId: string, now: Date): QuotaSummary {
  return summarizeRollingQuota(
    getAllRecords()
      .filter((record) => record.userId === userId)
      .flatMap((record) => record.quotaEntries),
    now,
  );
}

function consumeFixtureReservation(
  record: FixtureMenuRecord,
  occurredAt: string,
) {
  if (record.providerRequestStarted) return;
  if (!record.reservationId || !record.userId) {
    throw new Error("quota_reservation_missing");
  }
  record.quotaEntries.push(
    quotaEntrySchema.parse({
      id: randomUUID(),
      userId: record.userId,
      menuId: record.id,
      reservationId: record.reservationId,
      kind: "consumption",
      amount: 1,
      businessKey: `menu:${record.id}:consumption`,
      occurredAt,
      reasonCode: "first_provider_request",
    }),
  );
  record.providerRequestStarted = true;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
