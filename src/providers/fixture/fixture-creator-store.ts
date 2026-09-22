import "server-only";

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SafeMenuDetail, SafeMenuSummary } from "@/application/contracts";
import { collectReviewIssues } from "@/application/review-issues";
import { ownershipTokenMatches } from "@/application/ownership";
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
}

interface StoredFixtureMenuRecord extends Omit<
  FixtureMenuRecord,
  "itemStates"
> {
  itemStates: Array<[string, ItemState]>;
}

declare global {
  var __menugenFixtureStore: Map<string, FixtureMenuRecord> | undefined;
}

const store = (globalThis.__menugenFixtureStore ??= new Map());
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

function getRecord(menuId: string): FixtureMenuRecord | undefined {
  try {
    const stored = JSON.parse(
      readFileSync(join(fixtureDirectory, `${menuId}.json`), "utf8"),
    ) as StoredFixtureMenuRecord;
    const record: FixtureMenuRecord = {
      ...stored,
      currentRevision: menuDraftV1Schema.parse(stored.currentRevision),
      itemStates: new Map(stored.itemStates),
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
  const destination = join(fixtureDirectory, `${record.id}.json`);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const stored: StoredFixtureMenuRecord = {
    ...record,
    itemStates: [...record.itemStates.entries()],
  };
  writeFileSync(temporary, JSON.stringify(stored), { mode: 0o600 });
  renameSync(temporary, destination);
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
