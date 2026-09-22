import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import type { ScannedUpload, StoredObject } from "@/application/contracts";
import type { SourcePhotoCrop } from "@/application/source-photo-crops";
import { preflightAssessmentV1Schema } from "@/domain/creator/preflight";
import { menuDraftV1Schema } from "@/domain/creator/revisions";
import type { MenuExtractionV2 } from "@/domain/menu/menu-extraction";
import type { ProviderMetadata } from "@/providers/contracts";
import { getDatabase } from "@/infrastructure/db/client";
import {
  assets,
  jobs,
  menuItems,
  menuRevisions,
  menuSources,
  menus,
  providerUsage,
} from "@/infrastructure/db/schema";

export interface StoredNormalizedPage extends StoredObject {
  sourceFileOrder: number;
  pageIndex: number;
  pageCount: number;
  assemblyId: string;
}

export class NeonIngestionRepository {
  async claimExtractionWorkflowStart(menuId: string): Promise<boolean> {
    const [claimed] = await getDatabase()
      .update(jobs)
      .set({ state: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(jobs.businessKey, `menu:${menuId}:extraction`),
          eq(jobs.state, "queued"),
        ),
      )
      .returning({ id: jobs.id });
    return Boolean(claimed);
  }

  async releaseExtractionWorkflowStart(menuId: string): Promise<void> {
    await getDatabase()
      .update(jobs)
      .set({ state: "queued", startedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(jobs.businessKey, `menu:${menuId}:extraction`),
          eq(jobs.state, "running"),
          isNull(jobs.workflowRunId),
        ),
      );
  }

  async persistNormalizedUpload(input: {
    menuId: string;
    scanned: ScannedUpload;
    pages: readonly StoredNormalizedPage[];
    now: Date;
  }): Promise<boolean> {
    if (input.scanned.menuId !== input.menuId) {
      throw new Error("upload_menu_mismatch");
    }
    return getDatabase().transaction(async (transaction) => {
      const [menu] = await transaction
        .select({ state: menus.state })
        .from(menus)
        .where(eq(menus.id, input.menuId))
        .for("update")
        .limit(1);
      if (!menu) throw new Error("menu_not_found");
      if (menu.state !== "uploading") return false;

      const grouped = new Map<number, StoredNormalizedPage[]>();
      for (const page of input.pages) {
        grouped.set(page.sourceFileOrder, [
          ...(grouped.get(page.sourceFileOrder) ?? []),
          page,
        ]);
      }
      for (const [sourceFileOrder, pages] of grouped) {
        const first = pages[0];
        if (!first) continue;
        await transaction.insert(menuSources).values({
          menuId: input.menuId,
          sourceFileOrder,
          originalFileName: `source-${String(sourceFileOrder + 1).padStart(2, "0")}`,
          normalizedMimeType: first.mimeType,
          byteSize: pages.reduce((total, page) => total + page.byteSize, 0),
          pageCount: pages.length,
          objectKey: first.key,
          scannerAssemblyId: input.scanned.assemblyId,
          malwareStatus: "clean",
        });
      }
      await transaction.insert(assets).values(
        input.pages.map((page) => ({
          menuId: input.menuId,
          kind: "normalized_page" as const,
          state: "ready" as const,
          objectKey: page.key,
          mimeType: page.mimeType,
          byteSize: page.byteSize,
          sourceFileOrder: page.sourceFileOrder,
          pageIndex: page.pageIndex,
        })),
      );
      await transaction.insert(jobs).values({
        menuId: input.menuId,
        kind: "extraction",
        businessKey: `menu:${input.menuId}:extraction`,
        state: "queued",
      });
      const [updated] = await transaction
        .update(menus)
        .set({ state: "preflight", updatedAt: input.now })
        .where(and(eq(menus.id, input.menuId), eq(menus.state, "uploading")))
        .returning({ id: menus.id });
      return Boolean(updated);
    });
  }

  async recordExtractionRun(menuId: string, runId: string): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(menus)
        .set({ extractionWorkflowRunId: runId, updatedAt: new Date() })
        .where(eq(menus.id, menuId));
      await transaction
        .update(jobs)
        .set({ workflowRunId: runId, state: "running", startedAt: new Date() })
        .where(eq(jobs.businessKey, `menu:${menuId}:extraction`));
    });
  }

  async recordSourceCleanupRun(menuId: string, runId: string): Promise<void> {
    await getDatabase()
      .update(menus)
      .set({ sourceCleanupWorkflowRunId: runId, updatedAt: new Date() })
      .where(eq(menus.id, menuId));
  }

  async getNormalizedPages(menuId: string) {
    return getDatabase()
      .select({
        objectKey: assets.objectKey,
        mimeType: assets.mimeType,
        byteSize: assets.byteSize,
        sourceFileOrder: assets.sourceFileOrder,
        pageIndex: assets.pageIndex,
      })
      .from(assets)
      .where(
        and(
          eq(assets.menuId, menuId),
          eq(assets.kind, "normalized_page"),
          eq(assets.state, "ready"),
        ),
      )
      .orderBy(assets.sourceFileOrder, assets.pageIndex);
  }

  async getMenuTarget(menuId: string) {
    const [menu] = await getDatabase()
      .select({ targetLanguage: menus.targetLanguage, state: menus.state })
      .from(menus)
      .where(eq(menus.id, menuId))
      .limit(1);
    if (!menu) throw new Error("menu_not_found");
    return menu;
  }

  async getPreflightAssessment(menuId: string) {
    const [row] = await getDatabase()
      .select({ assessment: menus.preflightAssessment })
      .from(menus)
      .where(eq(menus.id, menuId))
      .limit(1);
    return row?.assessment
      ? preflightAssessmentV1Schema.parse(row.assessment)
      : null;
  }

  async getCurrentRevision(menuId: string) {
    const [row] = await getDatabase()
      .select({ snapshot: menuRevisions.snapshot })
      .from(menus)
      .innerJoin(menuRevisions, eq(menuRevisions.id, menus.currentRevisionId))
      .where(eq(menus.id, menuId))
      .limit(1);
    if (!row) throw new Error("revision_not_found");
    return menuDraftV1Schema.parse(row.snapshot);
  }

  async savePreflight(input: {
    menuId: string;
    assessment: unknown;
    metadata: readonly ProviderMetadata[];
    now: Date;
  }): Promise<"rejected" | "continue"> {
    const assessment = preflightAssessmentV1Schema.parse(input.assessment);
    return getDatabase().transaction(async (transaction) => {
      for (const metadata of input.metadata) {
        await recordUsage(transaction, input.menuId, metadata, input.now);
      }
      const rejected = assessment.disposition === "reject";
      await transaction
        .update(menus)
        .set({
          preflightAssessment: assessment,
          state: rejected ? "failed" : "extracting",
          updatedAt: input.now,
        })
        .where(eq(menus.id, input.menuId));
      if (rejected) {
        await transaction
          .update(jobs)
          .set({
            state: "failed",
            sanitizedErrorCode: "preflight_rejected",
            finishedAt: input.now,
            updatedAt: input.now,
          })
          .where(eq(jobs.businessKey, `menu:${input.menuId}:extraction`));
      }
      return rejected ? "rejected" : "continue";
    });
  }

  async saveExtraction(input: {
    menuId: string;
    menu: MenuExtractionV2;
    metadata: readonly ProviderMetadata[];
    now: Date;
  }) {
    const itemCount = input.menu.sections.reduce(
      (total, section) => total + section.items.length,
      0,
    );
    if (itemCount > 100) throw new Error("extracted_item_limit");
    const revision = menuDraftV1Schema.parse({
      schemaVersion: "1",
      menuId: input.menuId,
      revisionId: randomUUID(),
      revisionNumber: 1,
      basedOnRevisionId: null,
      createdAt: input.now.toISOString(),
      menu: input.menu,
      corrections: [],
      reviewResolutions: [],
    });
    await getDatabase().transaction(async (transaction) => {
      const [locked] = await transaction
        .select({
          state: menus.state,
          currentRevisionId: menus.currentRevisionId,
        })
        .from(menus)
        .where(eq(menus.id, input.menuId))
        .for("update")
        .limit(1);
      if (!locked) throw new Error("menu_not_found");
      if (locked.currentRevisionId) return;
      if (locked.state !== "extracting")
        throw new Error("extraction_not_active");
      await transaction.insert(menuRevisions).values({
        id: revision.revisionId,
        menuId: input.menuId,
        revisionNumber: 1,
        snapshot: revision,
      });
      await transaction.insert(menuItems).values(
        input.menu.sections.flatMap((section) =>
          section.items.map((item) => ({
            menuId: input.menuId,
            itemId: item.id,
            state: "pending" as const,
          })),
        ),
      );
      for (const metadata of input.metadata) {
        await recordUsage(transaction, input.menuId, metadata, input.now);
      }
      await transaction
        .update(menus)
        .set({ currentRevisionId: revision.revisionId, updatedAt: input.now })
        .where(eq(menus.id, input.menuId));
    });
    return revision;
  }

  async saveSourcePhotoCrop(input: {
    menuId: string;
    crop: SourcePhotoCrop;
    object: StoredObject;
    now: Date;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      const [asset] = await transaction
        .insert(assets)
        .values({
          menuId: input.menuId,
          itemId: input.crop.associatedItemId,
          kind: "source_photo_crop",
          state: "ready",
          objectKey: input.object.key,
          mimeType: input.object.mimeType,
          byteSize: input.object.byteSize,
          sourceCandidateId: input.crop.candidateId,
          expiresAt: addDays(input.now, 30),
        })
        .onConflictDoUpdate({
          target: assets.objectKey,
          set: { state: "ready", updatedAt: input.now },
        })
        .returning({ id: assets.id });
      if (
        asset &&
        input.crop.disposition === "automatic_reuse" &&
        input.crop.associatedItemId
      ) {
        await transaction
          .update(menuItems)
          .set({
            state: "source_photo_ready",
            activeAssetId: asset.id,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(menuItems.menuId, input.menuId),
              eq(menuItems.itemId, input.crop.associatedItemId),
            ),
          );
      }
    });
  }

  async markReviewReady(menuId: string, now: Date): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(menus)
        .set({ state: "review_ready", updatedAt: now })
        .where(and(eq(menus.id, menuId), eq(menus.state, "extracting")));
      await transaction
        .update(jobs)
        .set({ state: "succeeded", finishedAt: now, updatedAt: now })
        .where(eq(jobs.businessKey, `menu:${menuId}:extraction`));
    });
  }

  async markExtractionFailed(menuId: string, code: string, now: Date) {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(menus)
        .set({ state: "failed", updatedAt: now })
        .where(eq(menus.id, menuId));
      await transaction
        .update(jobs)
        .set({
          state: "failed",
          sanitizedErrorCode: code,
          finishedAt: now,
          updatedAt: now,
        })
        .where(eq(jobs.businessKey, `menu:${menuId}:extraction`));
    });
  }
}

async function recordUsage(
  transaction: Parameters<
    Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
  >[0],
  menuId: string,
  metadata: ProviderMetadata,
  now: Date,
) {
  await transaction.insert(providerUsage).values({
    menuId,
    operation: metadata.operation,
    provider: metadata.provider,
    model: metadata.model,
    inputTokens: metadata.usage.inputTokens,
    outputTokens: metadata.usage.outputTokens,
    imageCount: metadata.usage.images,
    estimatedCostUsd: metadata.estimatedCostUsd.toFixed(6),
    recordedAt: now,
  });
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
