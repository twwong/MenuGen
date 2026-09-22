import "server-only";

import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { getDatabase } from "@/infrastructure/db/client";
import {
  assets,
  creatorUsers,
  deletionAudits,
  emailOutbox,
  menuSources,
  menus,
} from "@/infrastructure/db/schema";

export interface CompletionEvent {
  eventKey: string;
  menuId: string;
  email: string;
}

export interface DeletionBatch {
  menuId: string;
  ownerUserId: string;
  sourceKeys: readonly string[];
  resultKeys: readonly string[];
}

export class NeonLifecycleRepository {
  async claimCompletionEvent(menuId: string): Promise<CompletionEvent | null> {
    return getDatabase().transaction(async (transaction) => {
      const [event] = await transaction
        .select({
          id: emailOutbox.id,
          eventKey: emailOutbox.eventKey,
          menuId: emailOutbox.menuId,
          state: emailOutbox.state,
          email: creatorUsers.email,
        })
        .from(emailOutbox)
        .innerJoin(creatorUsers, eq(creatorUsers.id, emailOutbox.userId))
        .where(eq(emailOutbox.eventKey, `menu:${menuId}:completion`))
        .for("update")
        .limit(1);
      if (!event || event.state === "sent") return null;
      if (!event.email) {
        await transaction
          .update(emailOutbox)
          .set({
            state: "failed",
            sanitizedErrorCode: "recipient_missing",
            updatedAt: new Date(),
          })
          .where(eq(emailOutbox.id, event.id));
        return null;
      }
      await transaction
        .update(emailOutbox)
        .set({
          state: "sending",
          sanitizedErrorCode: null,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, event.id));
      return {
        eventKey: event.eventKey,
        menuId: event.menuId,
        email: event.email,
      };
    });
  }

  async markCompletionEmailSent(input: {
    eventKey: string;
    providerMessageId: string;
    now: Date;
  }): Promise<void> {
    await getDatabase()
      .update(emailOutbox)
      .set({
        state: "sent",
        resendId: input.providerMessageId,
        sentAt: input.now,
        sanitizedErrorCode: null,
        updatedAt: input.now,
      })
      .where(eq(emailOutbox.eventKey, input.eventKey));
  }

  async markCompletionEmailFailed(input: {
    eventKey: string;
    sanitizedErrorCode: string;
    retryable: boolean;
    now: Date;
  }): Promise<void> {
    await getDatabase()
      .update(emailOutbox)
      .set({
        state: input.retryable ? "pending" : "failed",
        sanitizedErrorCode: input.sanitizedErrorCode,
        updatedAt: input.now,
      })
      .where(eq(emailOutbox.eventKey, input.eventKey));
  }

  async prepareDeletion(input: {
    menuId: string;
    userId: string;
    reason: "user_request" | "expiration";
    now: Date;
  }): Promise<DeletionBatch> {
    return getDatabase().transaction(async (transaction) => {
      const [menu] = await transaction
        .select({ state: menus.state, ownerUserId: menus.ownerUserId })
        .from(menus)
        .where(
          and(eq(menus.id, input.menuId), eq(menus.ownerUserId, input.userId)),
        )
        .for("update")
        .limit(1);
      if (!menu) {
        const [audit] = await transaction
          .select({ ownerUserId: deletionAudits.ownerUserId })
          .from(deletionAudits)
          .where(eq(deletionAudits.menuId, input.menuId))
          .limit(1);
        if (audit?.ownerUserId !== input.userId)
          throw new Error("menu_not_found");
        return {
          menuId: input.menuId,
          ownerUserId: input.userId,
          sourceKeys: [],
          resultKeys: [],
        };
      }
      if (menu.state !== "deleting") {
        await transaction
          .update(menus)
          .set({ state: "deleting", updatedAt: input.now })
          .where(eq(menus.id, input.menuId));
      }
      const sourceRows = await transaction
        .select({ objectKey: menuSources.objectKey })
        .from(menuSources)
        .where(eq(menuSources.menuId, input.menuId));
      const assetRows = await transaction
        .select({ objectKey: assets.objectKey, kind: assets.kind })
        .from(assets)
        .where(and(eq(assets.menuId, input.menuId), eq(assets.state, "ready")));
      return {
        menuId: input.menuId,
        ownerUserId: input.userId,
        sourceKeys: [
          ...sourceRows.map((row) => row.objectKey),
          ...assetRows
            .filter((row) => ["source", "normalized_page"].includes(row.kind))
            .map((row) => row.objectKey),
        ],
        resultKeys: assetRows
          .filter((row) =>
            ["source_photo_crop", "generated_image"].includes(row.kind),
          )
          .map((row) => row.objectKey),
      };
    });
  }

  async finalizeDeletion(input: {
    batch: DeletionBatch;
    reason: "user_request" | "expiration";
    now: Date;
  }): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      const retainUntil = addDays(input.now, 90);
      const auditRows = [
        {
          assetKind: "source" as const,
          count: input.batch.sourceKeys.length,
        },
        {
          assetKind: "generated_image" as const,
          count: input.batch.resultKeys.length,
        },
      ];
      for (const audit of auditRows) {
        await transaction
          .insert(deletionAudits)
          .values({
            menuId: input.batch.menuId,
            ownerUserId: input.batch.ownerUserId,
            businessKey: `menu:${input.batch.menuId}:delete:${audit.assetKind}`,
            reason: input.reason,
            assetKind: audit.assetKind,
            outcome: audit.count === 0 ? "nothing_to_delete" : "deleted",
            recordedAt: input.now,
            retainUntil,
            contentFree: true,
          })
          .onConflictDoNothing({ target: deletionAudits.businessKey });
      }
      await transaction.delete(menus).where(eq(menus.id, input.batch.menuId));
    });
  }

  async getSourceCleanupBatch(menuId: string): Promise<readonly string[]> {
    const database = getDatabase();
    const sourceRows = await database
      .select({ objectKey: menuSources.objectKey })
      .from(menuSources)
      .where(
        and(eq(menuSources.menuId, menuId), isNull(menuSources.deletedAt)),
      );
    const assetRows = await database
      .select({ objectKey: assets.objectKey })
      .from(assets)
      .where(
        and(
          eq(assets.menuId, menuId),
          inArray(assets.kind, ["source", "normalized_page"]),
          eq(assets.state, "ready"),
        ),
      );
    return [
      ...sourceRows.map((row) => row.objectKey),
      ...assetRows.map((row) => row.objectKey),
    ];
  }

  async recordSourceCleanup(menuId: string, now: Date): Promise<void> {
    await getDatabase().transaction(async (transaction) => {
      await transaction
        .update(menuSources)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(menuSources.menuId, menuId));
      await transaction
        .update(assets)
        .set({ state: "deleted", deletedAt: now, updatedAt: now })
        .where(
          and(
            eq(assets.menuId, menuId),
            inArray(assets.kind, ["source", "normalized_page"]),
          ),
        );
      await transaction
        .update(menus)
        .set({ sourceDeletionCompletedAt: now, updatedAt: now })
        .where(eq(menus.id, menuId));
      await transaction
        .insert(deletionAudits)
        .values({
          menuId,
          businessKey: `menu:${menuId}:source-cleanup`,
          reason: "source_cleanup",
          assetKind: "source",
          outcome: "deleted",
          recordedAt: now,
          retainUntil: addDays(now, 90),
          contentFree: true,
        })
        .onConflictDoNothing({ target: deletionAudits.businessKey });
    });
  }

  async pruneDeletionAudits(now: Date): Promise<number> {
    const deleted = await getDatabase()
      .delete(deletionAudits)
      .where(lt(deletionAudits.retainUntil, now))
      .returning({ id: deletionAudits.id });
    return deleted.length;
  }
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
