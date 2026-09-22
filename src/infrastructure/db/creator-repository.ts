import "server-only";

import { randomUUID } from "node:crypto";

import { and, desc, eq, gt, or } from "drizzle-orm";

import type {
  ActorContext,
  CreatorRepository,
  SafeMenuDetail,
  SafeMenuSummary,
} from "@/application/contracts";
import { hashAnonymousOwnershipToken } from "@/application/ownership";
import { collectReviewIssues } from "@/application/review-issues";
import { summarizeRollingQuota } from "@/domain/creator/quota";
import {
  createRevisedDraft,
  menuDraftV1Schema,
} from "@/domain/creator/revisions";
import { assertMenuTransition, menuStateSchema } from "@/domain/creator/state";
import { targetLanguageSchema } from "@/domain/menu/menu-extraction";
import { getDatabase } from "@/infrastructure/db/client";
import {
  creatorUsers,
  menuItems,
  menuRevisions,
  menus,
  quotaLedger,
} from "@/infrastructure/db/schema";

export async function ensureCreatorUser(input: {
  clerkUserId: string;
  email: string | null;
}): Promise<{ id: string }> {
  const [user] = await getDatabase()
    .insert(creatorUsers)
    .values({ clerkUserId: input.clerkUserId, email: input.email })
    .onConflictDoUpdate({
      target: creatorUsers.clerkUserId,
      set: { email: input.email, updatedAt: new Date() },
    })
    .returning({ id: creatorUsers.id });
  if (!user) throw new Error("creator_user_upsert_failed");
  return user;
}

export class NeonCreatorRepository implements CreatorRepository {
  async createAnonymousMenu(
    input: Parameters<CreatorRepository["createAnonymousMenu"]>[0],
  ): Promise<SafeMenuSummary> {
    const [row] = await getDatabase()
      .insert(menus)
      .values({
        id: input.menuId,
        anonymousTokenHash: input.anonymousTokenHash,
        targetLanguage: input.targetLanguage,
      })
      .returning();
    if (!row) throw new Error("menu_create_failed");
    return toSummary(row, 0, 0, 0);
  }

  async getOwnedMenu(
    menuId: string,
    actor: ActorContext,
  ): Promise<SafeMenuDetail | null> {
    const database = getDatabase();
    const [row] = await database
      .select()
      .from(menus)
      .where(and(eq(menus.id, menuId), ownershipCondition(actor)))
      .limit(1);
    if (!row) return null;

    const revisionRows = row.currentRevisionId
      ? await database
          .select({ snapshot: menuRevisions.snapshot })
          .from(menuRevisions)
          .where(eq(menuRevisions.id, row.currentRevisionId))
          .limit(1)
      : [];
    const currentRevision = revisionRows[0]
      ? menuDraftV1Schema.parse(revisionRows[0].snapshot)
      : null;
    const itemRows = await database
      .select({ state: menuItems.state })
      .from(menuItems)
      .where(eq(menuItems.menuId, menuId));

    const completedItemCount = itemRows.filter((item) =>
      ["source_photo_ready", "generated", "failed", "not_eligible"].includes(
        item.state,
      ),
    ).length;
    return {
      ...toSummary(
        row,
        countReviewIssues(currentRevision),
        completedItemCount,
        itemRows.length,
      ),
      currentRevision,
      generationRevisionId: row.generationRevisionId,
    };
  }

  async listOwnedMenus(
    actor: ActorContext,
  ): Promise<readonly SafeMenuSummary[]> {
    const database = getDatabase();
    const rows = await database
      .select()
      .from(menus)
      .where(ownershipCondition(actor))
      .orderBy(desc(menus.updatedAt));

    return Promise.all(
      rows.map(async (row) => {
        const itemRows = await database
          .select({ state: menuItems.state })
          .from(menuItems)
          .where(eq(menuItems.menuId, row.id));
        return toSummary(
          row,
          0,
          itemRows.filter((item) =>
            [
              "source_photo_ready",
              "generated",
              "failed",
              "not_eligible",
            ].includes(item.state),
          ).length,
          itemRows.length,
        );
      }),
    );
  }

  async claimAnonymousMenu(
    input: Parameters<CreatorRepository["claimAnonymousMenu"]>[0],
  ): Promise<boolean> {
    const [claimed] = await getDatabase()
      .update(menus)
      .set({
        ownerUserId: input.userId,
        anonymousTokenHash: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(menus.id, input.menuId),
          eq(menus.anonymousTokenHash, input.anonymousTokenHash),
        ),
      )
      .returning({ id: menus.id });
    return Boolean(claimed);
  }

  async saveInitialRevision(
    input: Parameters<CreatorRepository["saveInitialRevision"]>[0],
  ): Promise<void> {
    const revision = menuDraftV1Schema.parse(input.revision);
    if (revision.revisionNumber !== 1 || revision.menuId !== input.menuId) {
      throw new Error("invalid_initial_revision");
    }

    await getDatabase().transaction(async (transaction) => {
      const [owned] = await transaction
        .select({ id: menus.id, currentRevisionId: menus.currentRevisionId })
        .from(menus)
        .where(and(eq(menus.id, input.menuId), ownershipCondition(input.actor)))
        .for("update")
        .limit(1);
      if (!owned) throw new Error("menu_not_found");
      if (owned.currentRevisionId) throw new Error("initial_revision_exists");

      await transaction.insert(menuRevisions).values({
        id: revision.revisionId,
        menuId: input.menuId,
        revisionNumber: 1,
        snapshot: revision,
        createdByUserId: input.actor.userId,
      });
      await transaction
        .update(menus)
        .set({ currentRevisionId: revision.revisionId, updatedAt: new Date() })
        .where(eq(menus.id, input.menuId));
    });
  }

  async appendRevision(
    input: Parameters<CreatorRepository["appendRevision"]>[0],
  ) {
    return getDatabase().transaction(async (transaction) => {
      const [owned] = await transaction
        .select({
          currentRevisionId: menus.currentRevisionId,
          state: menus.state,
        })
        .from(menus)
        .where(and(eq(menus.id, input.menuId), ownershipCondition(input.actor)))
        .for("update")
        .limit(1);
      if (!owned || owned.currentRevisionId !== input.previousRevisionId) {
        throw new Error("revision_conflict");
      }
      if (owned.state !== "review_ready") throw new Error("menu_not_editable");

      const [previousRow] = await transaction
        .select({ snapshot: menuRevisions.snapshot })
        .from(menuRevisions)
        .where(eq(menuRevisions.id, input.previousRevisionId))
        .limit(1);
      if (!previousRow) throw new Error("revision_not_found");

      const revised = createRevisedDraft({
        previous: menuDraftV1Schema.parse(previousRow.snapshot),
        revisionId: randomUUID(),
        createdAt: new Date().toISOString(),
        patches: input.patches,
        resolutions: input.resolutions,
      });
      await transaction.insert(menuRevisions).values({
        id: revised.revisionId,
        menuId: input.menuId,
        revisionNumber: revised.revisionNumber,
        basedOnRevisionId: revised.basedOnRevisionId,
        snapshot: revised,
        createdByUserId: input.actor.userId,
      });
      await transaction
        .update(menus)
        .set({ currentRevisionId: revised.revisionId, updatedAt: new Date() })
        .where(eq(menus.id, input.menuId));
      return revised;
    });
  }

  async transitionMenu(
    input: Parameters<CreatorRepository["transitionMenu"]>[0],
  ): Promise<boolean> {
    assertMenuTransition(input.expectedState, input.nextState);
    const [updated] = await getDatabase()
      .update(menus)
      .set({ state: input.nextState, updatedAt: new Date() })
      .where(
        and(
          eq(menus.id, input.menuId),
          eq(menus.state, input.expectedState),
          ownershipCondition(input.actor),
        ),
      )
      .returning({ id: menus.id });
    return Boolean(updated);
  }

  async getQuotaSummary(userId: string, now: Date) {
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - 30);
    const rows = await getDatabase()
      .select()
      .from(quotaLedger)
      .where(
        and(
          eq(quotaLedger.userId, userId),
          gt(quotaLedger.occurredAt, windowStart),
        ),
      );

    return summarizeRollingQuota(
      rows.map((row) => ({
        ...row,
        kind: row.kind,
        occurredAt: row.occurredAt.toISOString(),
      })),
      now,
    );
  }
}

function ownershipCondition(actor: ActorContext) {
  const conditions = [];
  if (actor.userId) conditions.push(eq(menus.ownerUserId, actor.userId));
  if (actor.anonymousToken) {
    conditions.push(
      eq(
        menus.anonymousTokenHash,
        hashAnonymousOwnershipToken(actor.anonymousToken),
      ),
    );
  }
  if (conditions.length === 0)
    return eq(menus.id, "00000000-0000-0000-0000-000000000000");
  return conditions.length === 1 ? conditions[0]! : or(...conditions)!;
}

function toSummary(
  row: typeof menus.$inferSelect,
  issueCount: number,
  completedItemCount: number,
  totalItemCount: number,
): SafeMenuSummary {
  return {
    id: row.id,
    state: menuStateSchema.parse(row.state),
    targetLanguage: targetLanguageSchema.parse(row.targetLanguage),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    expiresAt: row.resultExpiresAt?.toISOString() ?? null,
    issueCount,
    completedItemCount,
    totalItemCount,
  };
}

function countReviewIssues(
  revision: ReturnType<typeof menuDraftV1Schema.parse> | null,
) {
  return revision ? collectReviewIssues(revision).length : 0;
}
