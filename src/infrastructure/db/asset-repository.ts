import "server-only";

import { and, eq, or } from "drizzle-orm";

import type { ActorContext } from "@/application/contracts";
import { hashAnonymousOwnershipToken } from "@/application/ownership";
import { getDatabase } from "@/infrastructure/db/client";
import { assets, menus } from "@/infrastructure/db/schema";

export async function getOwnedResultAsset(
  assetId: string,
  actor: ActorContext,
): Promise<{ objectKey: string; mimeType: string; byteSize: number } | null> {
  const ownerConditions = [];
  if (actor.userId) ownerConditions.push(eq(menus.ownerUserId, actor.userId));
  if (actor.anonymousToken) {
    ownerConditions.push(
      eq(
        menus.anonymousTokenHash,
        hashAnonymousOwnershipToken(actor.anonymousToken),
      ),
    );
  }
  if (ownerConditions.length === 0) return null;
  const ownership =
    ownerConditions.length === 1
      ? ownerConditions[0]!
      : or(...ownerConditions)!;
  const [row] = await getDatabase()
    .select({
      objectKey: assets.objectKey,
      mimeType: assets.mimeType,
      byteSize: assets.byteSize,
    })
    .from(assets)
    .innerJoin(menus, eq(menus.id, assets.menuId))
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.state, "ready"),
        or(
          eq(assets.kind, "source_photo_crop"),
          eq(assets.kind, "generated_image"),
        ),
        ownership,
      ),
    )
    .limit(1);
  return row ?? null;
}
