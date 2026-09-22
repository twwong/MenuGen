import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import type { SafeMenuDetail } from "@/application/contracts";
import { buildGenerationPlan } from "@/domain/creator/generation-policy";
import { summarizeRollingQuota } from "@/domain/creator/quota";
import { menuDraftV1Schema } from "@/domain/creator/revisions";
import type { ItemState } from "@/domain/creator/state";
import { buildDishImageContext } from "@/pipeline/image-prompt";
import type { DishImageContext } from "@/providers/contracts";
import { getDatabase } from "@/infrastructure/db/client";
import {
  assets,
  creatorUsers,
  emailOutbox,
  generationAttempts,
  jobs,
  menuItems,
  menuRevisions,
  menus,
  providerUsage,
  quotaLedger,
} from "@/infrastructure/db/schema";

export interface GenerationReservation {
  reservationId: string | null;
  generationItemCount: number;
  sourcePhotoItemCount: number;
  sourcePhotoOnly: boolean;
}

export interface ProviderAttemptStart {
  disposition: "call_provider" | "already_complete" | "refused";
  attemptId: string | null;
  requestKey: string | null;
  sanitizedReasonCode: string | null;
}

export interface ActiveGeneration {
  revisionId: string;
  itemIds: readonly string[];
  ownerUserId: string;
}

export interface RegenerationReservation {
  revisionId: string;
  internalItemId: string;
  regenerationSequence: number;
  previousState: "generated" | "failed";
}

export interface ManagedGenerationView {
  menu: SafeMenuDetail;
  items: ReadonlyArray<{
    publicId: string;
    internalItemId: string;
    activeAssetId: string | null;
    state: ItemState;
    provenance: "source" | "generated" | "unavailable" | null;
    sanitizedErrorCode: string | null;
    regenerationCount: number;
  }>;
  quota: ReturnType<typeof summarizeRollingQuota>;
  estimatedCostUsd: number;
  completionEmailSent: boolean;
}

export class NeonGenerationRepository {
  async claimGenerationWorkflowStart(menuId: string): Promise<boolean> {
    const [claimed] = await getDatabase()
      .update(jobs)
      .set({ state: "running", startedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(jobs.businessKey, `menu:${menuId}:generation`),
          eq(jobs.state, "queued"),
        ),
      )
      .returning({ id: jobs.id });
    return Boolean(claimed);
  }

  async reserveRegeneration(input: {
    menuId: string;
    itemPublicId: string;
    userId: string;
    now: Date;
  }): Promise<RegenerationReservation> {
    return getDatabase().transaction(async (transaction) => {
      const [menu] = await transaction
        .select({
          state: menus.state,
          generationRevisionId: menus.generationRevisionId,
        })
        .from(menus)
        .where(
          and(eq(menus.id, input.menuId), eq(menus.ownerUserId, input.userId)),
        )
        .for("update")
        .limit(1);
      if (!menu || !menu.generationRevisionId)
        throw new Error("menu_not_found");
      if (menu.state !== "ready") throw new Error("menu_not_ready");
      const [item] = await transaction
        .select({
          itemId: menuItems.itemId,
          state: menuItems.state,
          count: menuItems.uploaderRegenerationCount,
        })
        .from(menuItems)
        .where(
          and(
            eq(menuItems.menuId, input.menuId),
            eq(menuItems.publicId, input.itemPublicId),
          ),
        )
        .for("update")
        .limit(1);
      if (!item || !["generated", "failed"].includes(item.state)) {
        throw new Error("item_not_regenerable");
      }
      if (item.count >= 2) throw new Error("regeneration_limit_reached");
      const regenerationSequence = item.count + 1;
      await transaction
        .update(menuItems)
        .set({
          state: "generation_eligible",
          uploaderRegenerationCount: regenerationSequence,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(menuItems.menuId, input.menuId),
            eq(menuItems.itemId, item.itemId),
          ),
        );
      await transaction
        .update(menus)
        .set({ state: "generating", updatedAt: input.now })
        .where(eq(menus.id, input.menuId));
      await transaction.insert(jobs).values({
        menuId: input.menuId,
        kind: "regeneration",
        businessKey: `menu:${input.menuId}:regeneration:${input.itemPublicId}:${regenerationSequence}`,
        state: "queued",
      });
      return {
        revisionId: menu.generationRevisionId,
        internalItemId: item.itemId,
        regenerationSequence,
        previousState: item.state as "generated" | "failed",
      };
    });
  }

  async releaseRegenerationStart(input: {
    menuId: string;
    itemId: string;
    itemPublicId: string;
    regenerationSequence: number;
    previousState: "generated" | "failed";
    now: Date;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      const [started] = await transaction
        .select({ id: generationAttempts.id })
        .from(generationAttempts)
        .where(
          and(
            eq(generationAttempts.menuId, input.menuId),
            eq(generationAttempts.itemId, input.itemId),
            eq(
              generationAttempts.regenerationSequence,
              input.regenerationSequence,
            ),
          ),
        )
        .limit(1);
      if (started) return;
      await transaction
        .update(menuItems)
        .set({
          state: input.previousState,
          uploaderRegenerationCount: input.regenerationSequence - 1,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(menuItems.menuId, input.menuId),
            eq(menuItems.itemId, input.itemId),
          ),
        );
      await transaction
        .update(menus)
        .set({ state: "ready", updatedAt: input.now })
        .where(and(eq(menus.id, input.menuId), eq(menus.state, "generating")));
      await transaction
        .update(jobs)
        .set({
          state: "failed",
          sanitizedErrorCode: "workflow_start_failed",
          finishedAt: input.now,
          updatedAt: input.now,
        })
        .where(
          eq(
            jobs.businessKey,
            `menu:${input.menuId}:regeneration:${input.itemPublicId}:${input.regenerationSequence}`,
          ),
        );
    });
  }

  async releaseGenerationWorkflowClaim(menuId: string, now: Date) {
    await getDatabase()
      .update(jobs)
      .set({ state: "queued", startedAt: null, updatedAt: now })
      .where(
        and(
          eq(jobs.businessKey, `menu:${menuId}:generation`),
          eq(jobs.state, "running"),
          isNull(jobs.workflowRunId),
        ),
      );
  }

  async getOwnedGenerationView(input: {
    menuId: string;
    userId: string;
    now?: Date;
  }): Promise<ManagedGenerationView | null> {
    const { NeonCreatorRepository } =
      await import("@/infrastructure/db/creator-repository");
    const creatorRepository = new NeonCreatorRepository();
    const menu = await creatorRepository.getOwnedMenu(input.menuId, {
      userId: input.userId,
      anonymousToken: null,
    });
    if (!menu) return null;
    const database = getDatabase();
    const itemRows = await database
      .select({
        publicId: menuItems.publicId,
        internalItemId: menuItems.itemId,
        state: menuItems.state,
        regenerationCount: menuItems.uploaderRegenerationCount,
        activeAssetId: menuItems.activeAssetId,
      })
      .from(menuItems)
      .where(eq(menuItems.menuId, input.menuId));
    const assetRows = await database
      .select({ id: assets.id, kind: assets.kind })
      .from(assets)
      .where(eq(assets.menuId, input.menuId));
    const assetKinds = new Map(
      assetRows.map((asset) => [asset.id, asset.kind]),
    );
    const attempts = await database
      .select({
        itemId: generationAttempts.itemId,
        attemptNumber: generationAttempts.attemptNumber,
        sanitizedErrorCode: generationAttempts.sanitizedErrorCode,
      })
      .from(generationAttempts)
      .where(eq(generationAttempts.menuId, input.menuId))
      .orderBy(asc(generationAttempts.attemptNumber));
    const lastErrorByItem = new Map<string, string | null>();
    for (const attempt of attempts) {
      lastErrorByItem.set(attempt.itemId, attempt.sanitizedErrorCode);
    }
    const [menuRow] = await database
      .select({ estimatedCostUsd: menus.estimatedCostUsd })
      .from(menus)
      .where(eq(menus.id, input.menuId))
      .limit(1);
    const [email] = await database
      .select({ state: emailOutbox.state })
      .from(emailOutbox)
      .where(eq(emailOutbox.eventKey, `menu:${input.menuId}:completion`))
      .limit(1);
    return {
      menu,
      items: itemRows.map((item) => {
        const kind = item.activeAssetId
          ? assetKinds.get(item.activeAssetId)
          : undefined;
        return {
          publicId: item.publicId,
          internalItemId: item.internalItemId,
          activeAssetId: item.activeAssetId,
          state: item.state,
          provenance:
            kind === "source_photo_crop"
              ? ("source" as const)
              : kind === "generated_image"
                ? ("generated" as const)
                : item.state === "failed"
                  ? ("unavailable" as const)
                  : null,
          sanitizedErrorCode: lastErrorByItem.get(item.internalItemId) ?? null,
          regenerationCount: item.regenerationCount,
        };
      }),
      quota: await creatorRepository.getQuotaSummary(
        input.userId,
        input.now ?? new Date(),
      ),
      estimatedCostUsd: Number(menuRow?.estimatedCostUsd ?? 0),
      completionEmailSent: email?.state === "sent",
    };
  }

  async getActiveGeneration(menuId: string): Promise<ActiveGeneration> {
    const database = getDatabase();
    const [menu] = await database
      .select({
        state: menus.state,
        revisionId: menus.generationRevisionId,
        ownerUserId: menus.ownerUserId,
      })
      .from(menus)
      .where(eq(menus.id, menuId))
      .limit(1);
    if (
      !menu ||
      menu.state !== "generating" ||
      !menu.revisionId ||
      !menu.ownerUserId
    ) {
      throw new Error("generation_not_active");
    }
    const itemRows = await database
      .select({ itemId: menuItems.itemId })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.menuId, menuId),
          eq(menuItems.state, "generation_eligible"),
        ),
      );
    return {
      revisionId: menu.revisionId,
      itemIds: itemRows.map((item) => item.itemId),
      ownerUserId: menu.ownerUserId,
    };
  }

  async getDishImageContext(input: {
    menuId: string;
    revisionId: string;
    itemId: string;
  }): Promise<DishImageContext> {
    const [row] = await getDatabase()
      .select({ snapshot: menuRevisions.snapshot })
      .from(menuRevisions)
      .where(
        and(
          eq(menuRevisions.menuId, input.menuId),
          eq(menuRevisions.id, input.revisionId),
        ),
      )
      .limit(1);
    if (!row) throw new Error("generation_revision_not_found");
    const revision = menuDraftV1Schema.parse(row.snapshot);
    const item = revision.menu.sections
      .flatMap((section) => section.items)
      .find((candidate) => candidate.id === input.itemId);
    if (!item) throw new Error("generation_item_not_found");
    return buildDishImageContext(item);
  }

  async reserveMenuCredit(input: {
    menuId: string;
    userId: string;
    now: Date;
  }): Promise<GenerationReservation> {
    return getDatabase().transaction(async (transaction) => {
      const [lockedUser] = await transaction
        .select({ id: creatorUsers.id })
        .from(creatorUsers)
        .where(eq(creatorUsers.id, input.userId))
        .for("update")
        .limit(1);
      if (!lockedUser) throw new Error("user_not_found");

      const [menu] = await transaction
        .select({
          state: menus.state,
          currentRevisionId: menus.currentRevisionId,
          generationRevisionId: menus.generationRevisionId,
        })
        .from(menus)
        .where(
          and(eq(menus.id, input.menuId), eq(menus.ownerUserId, input.userId)),
        )
        .for("update")
        .limit(1);
      if (!menu) throw new Error("menu_not_found");

      if (menu.state === "generating" || menu.state === "ready") {
        return this.readExistingReservation(transaction, input.menuId);
      }
      if (menu.state !== "generation_ready" || !menu.currentRevisionId) {
        throw new Error("menu_not_ready_for_generation");
      }

      const [revisionRow] = await transaction
        .select({ snapshot: menuRevisions.snapshot })
        .from(menuRevisions)
        .where(eq(menuRevisions.id, menu.currentRevisionId))
        .limit(1);
      if (!revisionRow) throw new Error("revision_not_found");
      const revision = menuDraftV1Schema.parse(revisionRow.snapshot);
      const plan = buildGenerationPlan(revision.menu);
      const generationItems = plan.filter(
        (item) => item.disposition === "generate",
      );
      const sourcePhotoItems = plan.filter(
        (item) => item.disposition === "reuse_source_photo",
      );

      await transaction
        .insert(menuItems)
        .values(
          plan.map((item) => ({
            menuId: input.menuId,
            itemId: item.itemId,
            state: stateForDisposition(item.disposition),
          })),
        )
        .onConflictDoUpdate({
          target: [menuItems.menuId, menuItems.itemId],
          set: { state: sql`excluded.state`, updatedAt: input.now },
        });

      if (generationItems.length === 0) {
        const resultExpiresAt = addDays(input.now, 30);
        await transaction
          .update(menus)
          .set({
            state: "ready",
            generationRevisionId: menu.currentRevisionId,
            resultExpiresAt,
            updatedAt: input.now,
          })
          .where(eq(menus.id, input.menuId));
        await transaction
          .update(assets)
          .set({ expiresAt: resultExpiresAt, updatedAt: input.now })
          .where(
            and(
              eq(assets.menuId, input.menuId),
              inArray(assets.kind, ["source_photo_crop", "generated_image"]),
            ),
          );
        await enqueueCompletion(transaction, {
          menuId: input.menuId,
          userId: input.userId,
          now: input.now,
        });
        await transaction
          .insert(jobs)
          .values({
            menuId: input.menuId,
            kind: "generation",
            businessKey: `menu:${input.menuId}:generation`,
            state: "queued",
          })
          .onConflictDoNothing({ target: jobs.businessKey });
        return {
          reservationId: null,
          generationItemCount: 0,
          sourcePhotoItemCount: sourcePhotoItems.length,
          sourcePhotoOnly: true,
        };
      }

      const windowStart = addDays(input.now, -30);
      const quotaRows = await transaction
        .select()
        .from(quotaLedger)
        .where(
          and(
            eq(quotaLedger.userId, input.userId),
            gt(quotaLedger.occurredAt, windowStart),
          ),
        );
      const quota = summarizeRollingQuota(
        quotaRows.map((row) => ({
          ...row,
          occurredAt: row.occurredAt.toISOString(),
        })),
        input.now,
      );
      if (quota.remaining < 1) throw new Error("quota_exhausted");

      const reservationId = randomUUID();
      await transaction.insert(quotaLedger).values({
        userId: input.userId,
        menuId: input.menuId,
        reservationId,
        kind: "reservation",
        amount: 1,
        businessKey: reservationKey(input.menuId),
        reasonCode: "initial_generation",
        occurredAt: input.now,
      });
      await transaction.insert(jobs).values({
        menuId: input.menuId,
        kind: "generation",
        businessKey: `menu:${input.menuId}:generation`,
        state: "queued",
      });
      await transaction
        .update(menus)
        .set({
          state: "generating",
          generationRevisionId: menu.currentRevisionId,
          updatedAt: input.now,
        })
        .where(eq(menus.id, input.menuId));

      return {
        reservationId,
        generationItemCount: generationItems.length,
        sourcePhotoItemCount: sourcePhotoItems.length,
        sourcePhotoOnly: false,
      };
    });
  }

  async recordWorkflowRun(input: {
    menuId: string;
    userId: string;
    runId: string;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      const [updated] = await transaction
        .update(menus)
        .set({ generationWorkflowRunId: input.runId, updatedAt: new Date() })
        .where(
          and(
            eq(menus.id, input.menuId),
            eq(menus.ownerUserId, input.userId),
            inArray(menus.state, ["generating", "ready"]),
          ),
        )
        .returning({ id: menus.id });
      if (!updated) throw new Error("generation_run_not_recorded");
      await transaction
        .update(jobs)
        .set({ workflowRunId: input.runId, updatedAt: new Date() })
        .where(eq(jobs.businessKey, `menu:${input.menuId}:generation`));
    });
  }

  async recordRegenerationRun(input: {
    menuId: string;
    itemPublicId: string;
    regenerationSequence: number;
    runId: string;
  }): Promise<void> {
    await getDatabase()
      .update(jobs)
      .set({
        workflowRunId: input.runId,
        state: "running",
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        eq(
          jobs.businessKey,
          `menu:${input.menuId}:regeneration:${input.itemPublicId}:${input.regenerationSequence}`,
        ),
      );
  }

  async beginProviderAttempt(input: {
    menuId: string;
    itemId: string;
    revisionId: string;
    requestedBy: "initial" | "uploader_regeneration";
    regenerationSequence?: number;
    provider: string;
    model: string;
    templateVersion: string;
    promptHash: string;
    reservedCostUsd: number;
    hardLimitUsd: number;
    now: Date;
  }): Promise<ProviderAttemptStart> {
    return getDatabase().transaction(async (transaction) => {
      const [menu] = await transaction
        .select({
          state: menus.state,
          ownerUserId: menus.ownerUserId,
          generationRevisionId: menus.generationRevisionId,
          estimatedCostUsd: menus.estimatedCostUsd,
        })
        .from(menus)
        .where(eq(menus.id, input.menuId))
        .for("update")
        .limit(1);
      if (
        !menu ||
        menu.state !== "generating" ||
        menu.generationRevisionId !== input.revisionId ||
        !menu.ownerUserId
      ) {
        throw new Error("generation_revision_not_active");
      }

      const priorAttempts = await transaction
        .select()
        .from(generationAttempts)
        .where(
          and(
            eq(generationAttempts.menuId, input.menuId),
            eq(generationAttempts.itemId, input.itemId),
            eq(generationAttempts.revisionId, input.revisionId),
            eq(generationAttempts.requestedBy, input.requestedBy),
            eq(
              generationAttempts.regenerationSequence,
              input.regenerationSequence ?? 0,
            ),
          ),
        )
        .orderBy(asc(generationAttempts.attemptNumber));
      if (priorAttempts.some((attempt) => attempt.state === "succeeded")) {
        return noProviderCall("already_complete", null);
      }
      const indeterminate = priorAttempts.find(
        (attempt) =>
          attempt.state === "running" && attempt.providerRequestStartedAt,
      );
      if (indeterminate) {
        await transaction
          .update(generationAttempts)
          .set({
            state: "failed",
            sanitizedErrorCode: "provider_outcome_unknown",
            updatedAt: input.now,
          })
          .where(eq(generationAttempts.id, indeterminate.id));
        await markItemFailed(transaction, input, "provider_outcome_unknown");
        return noProviderCall("refused", "provider_outcome_unknown");
      }
      if (priorAttempts.length >= 3) {
        await markItemFailed(transaction, input, "retry_limit_reached");
        return noProviderCall("refused", "retry_limit_reached");
      }

      const currentCost = Number(menu.estimatedCostUsd);
      if (currentCost + input.reservedCostUsd > input.hardLimitUsd) {
        await markItemFailed(transaction, input, "menu_cost_ceiling");
        return noProviderCall("refused", "menu_cost_ceiling");
      }

      const [reservation] = await transaction
        .select({ reservationId: quotaLedger.reservationId })
        .from(quotaLedger)
        .where(eq(quotaLedger.businessKey, reservationKey(input.menuId)))
        .limit(1);
      if (!reservation) throw new Error("quota_reservation_missing");

      const attemptNumber = priorAttempts.length + 1;
      const attemptId = randomUUID();
      const regenerationSequence = input.regenerationSequence ?? 0;
      const requestKey = `menu:${input.menuId}:item:${input.itemId}:${input.requestedBy}:${regenerationSequence}:${attemptNumber}`;
      await transaction.insert(generationAttempts).values({
        id: attemptId,
        menuId: input.menuId,
        itemId: input.itemId,
        revisionId: input.revisionId,
        requestKey,
        attemptNumber,
        regenerationSequence,
        requestedBy: input.requestedBy,
        state: "running",
        provider: input.provider,
        model: input.model,
        templateVersion: input.templateVersion,
        promptHash: input.promptHash,
        moderationResult: "allowed",
        estimatedCostUsd: input.reservedCostUsd.toFixed(6),
        providerRequestStartedAt: input.now,
      });
      await transaction
        .insert(quotaLedger)
        .values({
          userId: menu.ownerUserId,
          menuId: input.menuId,
          reservationId: reservation.reservationId,
          kind: "consumption",
          amount: 1,
          businessKey: consumptionKey(input.menuId),
          reasonCode: "first_provider_request",
          occurredAt: input.now,
        })
        .onConflictDoNothing({ target: quotaLedger.businessKey });
      await transaction
        .update(menus)
        .set({
          estimatedCostUsd: (currentCost + input.reservedCostUsd).toFixed(6),
          updatedAt: input.now,
        })
        .where(eq(menus.id, input.menuId));
      await transaction
        .update(menuItems)
        .set({ state: "generating", updatedAt: input.now })
        .where(
          and(
            eq(menuItems.menuId, input.menuId),
            eq(menuItems.itemId, input.itemId),
          ),
        );
      return {
        disposition: "call_provider",
        attemptId,
        requestKey,
        sanitizedReasonCode: null,
      };
    });
  }

  async recordProviderSuccess(input: {
    attemptId: string;
    menuId: string;
    itemId: string;
    objectKey: string;
    mimeType: string;
    byteSize: number;
    actualCostUsd: number;
    provider: string;
    model: string;
    inputTokens?: number;
    outputTokens?: number;
    now: Date;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      const [attempt] = await transaction
        .select({ state: generationAttempts.state })
        .from(generationAttempts)
        .where(eq(generationAttempts.id, input.attemptId))
        .for("update")
        .limit(1);
      if (!attempt) throw new Error("generation_attempt_not_found");
      if (attempt.state === "succeeded") return;

      const [asset] = await transaction
        .insert(assets)
        .values({
          menuId: input.menuId,
          itemId: input.itemId,
          kind: "generated_image",
          state: "ready",
          objectKey: input.objectKey,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          expiresAt: addDays(input.now, 30),
        })
        .returning({ id: assets.id });
      if (!asset) throw new Error("generated_asset_not_recorded");
      await transaction
        .update(menuItems)
        .set({
          state: "generated",
          activeAssetId: asset.id,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(menuItems.menuId, input.menuId),
            eq(menuItems.itemId, input.itemId),
          ),
        );
      await transaction
        .update(generationAttempts)
        .set({
          state: "succeeded",
          estimatedCostUsd: input.actualCostUsd.toFixed(6),
          updatedAt: input.now,
        })
        .where(eq(generationAttempts.id, input.attemptId));
      await transaction.insert(providerUsage).values({
        menuId: input.menuId,
        operation: "generate_dish_image",
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        imageCount: 1,
        estimatedCostUsd: input.actualCostUsd.toFixed(6),
        recordedAt: input.now,
      });
    });
  }

  async recordProviderFailure(input: {
    attemptId: string;
    menuId: string;
    itemId: string;
    sanitizedErrorCode: string;
    permanent: boolean;
    now: Date;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(generationAttempts)
        .set({
          state: "failed",
          sanitizedErrorCode: input.sanitizedErrorCode,
          updatedAt: input.now,
        })
        .where(eq(generationAttempts.id, input.attemptId));
      if (input.permanent) {
        await markItemFailed(transaction, input, input.sanitizedErrorCode);
      }
    });
  }

  async markItemFailedWithoutProvider(input: {
    menuId: string;
    itemId: string;
    sanitizedErrorCode: string;
    now: Date;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      await markItemFailed(transaction, input, input.sanitizedErrorCode);
    });
  }

  async completeSourcePhotoOnly(menuId: string, now: Date): Promise<void> {
    await getDatabase()
      .update(jobs)
      .set({ state: "succeeded", finishedAt: now, updatedAt: now })
      .where(eq(jobs.businessKey, `menu:${menuId}:generation`));
  }

  async finalizeMenu(menuId: string, now: Date): Promise<boolean> {
    return getDatabase().transaction(async (transaction) => {
      const [menu] = await transaction
        .select({ state: menus.state, ownerUserId: menus.ownerUserId })
        .from(menus)
        .where(eq(menus.id, menuId))
        .for("update")
        .limit(1);
      if (!menu || !menu.ownerUserId) throw new Error("menu_not_found");
      if (menu.state === "ready") return true;
      if (menu.state !== "generating") return false;
      const itemRows = await transaction
        .select({ state: menuItems.state })
        .from(menuItems)
        .where(eq(menuItems.menuId, menuId));
      if (
        itemRows.some((item) =>
          ["pending", "generation_eligible", "generating"].includes(item.state),
        )
      ) {
        return false;
      }
      const partial = itemRows.some((item) => item.state === "failed");
      await transaction
        .update(menus)
        .set({
          state: "ready",
          resultExpiresAt: addDays(now, 30),
          updatedAt: now,
        })
        .where(eq(menus.id, menuId));
      await transaction
        .update(assets)
        .set({ expiresAt: addDays(now, 30), updatedAt: now })
        .where(
          and(
            eq(assets.menuId, menuId),
            inArray(assets.kind, ["source_photo_crop", "generated_image"]),
          ),
        );
      await transaction
        .update(jobs)
        .set({
          state: partial ? "partially_succeeded" : "succeeded",
          finishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobs.menuId, menuId),
            inArray(jobs.state, ["queued", "running"]),
          ),
        );
      await enqueueCompletion(transaction, {
        menuId,
        userId: menu.ownerUserId,
        now,
      });
      return true;
    });
  }

  async releaseReservationIfNoRequest(input: {
    menuId: string;
    userId: string;
    reasonCode: string;
    now: Date;
  }): Promise<boolean> {
    return getDatabase().transaction(async (transaction) => {
      const [started] = await transaction
        .select({ id: generationAttempts.id })
        .from(generationAttempts)
        .where(
          and(
            eq(generationAttempts.menuId, input.menuId),
            isNotNull(generationAttempts.providerRequestStartedAt),
          ),
        )
        .limit(1);
      if (started) return false;
      const [reservation] = await transaction
        .select({ reservationId: quotaLedger.reservationId })
        .from(quotaLedger)
        .where(eq(quotaLedger.businessKey, reservationKey(input.menuId)))
        .limit(1);
      if (!reservation) return false;
      const [released] = await transaction
        .insert(quotaLedger)
        .values({
          userId: input.userId,
          menuId: input.menuId,
          reservationId: reservation.reservationId,
          kind: "release",
          amount: -1,
          businessKey: `menu:${input.menuId}:release`,
          reasonCode: input.reasonCode,
          occurredAt: input.now,
        })
        .onConflictDoNothing({ target: quotaLedger.businessKey })
        .returning({ id: quotaLedger.id });
      if (released) {
        await transaction
          .update(menus)
          .set({ state: "failed", updatedAt: input.now })
          .where(
            and(eq(menus.id, input.menuId), eq(menus.state, "generating")),
          );
      }
      return Boolean(released);
    });
  }

  private async readExistingReservation(
    transaction: Parameters<
      Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
    >[0],
    menuId: string,
  ): Promise<GenerationReservation> {
    const [reservation] = await transaction
      .select({ reservationId: quotaLedger.reservationId })
      .from(quotaLedger)
      .where(eq(quotaLedger.businessKey, reservationKey(menuId)))
      .limit(1);
    const itemRows = await transaction
      .select({ state: menuItems.state })
      .from(menuItems)
      .where(eq(menuItems.menuId, menuId));
    const generationItemCount = itemRows.filter((item) =>
      ["generation_eligible", "generating", "generated", "failed"].includes(
        item.state,
      ),
    ).length;
    const sourcePhotoItemCount = itemRows.filter(
      (item) => item.state === "source_photo_ready",
    ).length;
    return {
      reservationId: reservation?.reservationId ?? null,
      generationItemCount,
      sourcePhotoItemCount,
      sourcePhotoOnly: generationItemCount === 0,
    };
  }
}

function stateForDisposition(
  disposition: ReturnType<typeof buildGenerationPlan>[number]["disposition"],
): ItemState {
  if (disposition === "reuse_source_photo") return "source_photo_ready";
  if (disposition === "generate") return "generation_eligible";
  return "not_eligible";
}

function reservationKey(menuId: string) {
  return `menu:${menuId}:reservation`;
}

function consumptionKey(menuId: string) {
  return `menu:${menuId}:consumption`;
}

function noProviderCall(
  disposition: "already_complete" | "refused",
  sanitizedReasonCode: string | null,
): ProviderAttemptStart {
  return {
    disposition,
    attemptId: null,
    requestKey: null,
    sanitizedReasonCode,
  };
}

async function markItemFailed(
  transaction: Parameters<
    Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
  >[0],
  input: { menuId: string; itemId: string; now: Date },
  sanitizedErrorCode: string,
) {
  await transaction
    .update(menuItems)
    .set({ state: "failed", updatedAt: input.now })
    .where(
      and(
        eq(menuItems.menuId, input.menuId),
        eq(menuItems.itemId, input.itemId),
      ),
    );
  await transaction
    .update(jobs)
    .set({ sanitizedErrorCode, updatedAt: input.now })
    .where(eq(jobs.businessKey, `menu:${input.menuId}:generation`));
}

async function enqueueCompletion(
  transaction: Parameters<
    Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
  >[0],
  input: { menuId: string; userId: string; now: Date },
) {
  await transaction
    .insert(emailOutbox)
    .values({
      eventKey: `menu:${input.menuId}:completion`,
      userId: input.userId,
      menuId: input.menuId,
      kind: "menu_completed",
      state: "pending",
      createdAt: input.now,
      updatedAt: input.now,
    })
    .onConflictDoNothing({ target: emailOutbox.eventKey });
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
