import "server-only";

import { getCreatorActor } from "@/app/create/session";
import type { SafeMenuDetail, SafeMenuSummary } from "@/application/contracts";
import { readCreatorEnvironment } from "@/config/env";
import { NeonCreatorRepository } from "@/infrastructure/db/creator-repository";
import {
  getOwnedFixtureMenu,
  listOwnedFixtureMenus,
} from "@/providers/fixture/fixture-creator-store";

export async function getOwnedCreatorMenu(
  menuId: string,
): Promise<SafeMenuDetail | null> {
  const actor = await getCreatorActor();
  return readCreatorEnvironment().CREATOR_BACKEND === "managed"
    ? new NeonCreatorRepository().getOwnedMenu(menuId, actor)
    : getOwnedFixtureMenu({ menuId, ...actor });
}

export async function listOwnedCreatorMenus(): Promise<
  readonly SafeMenuSummary[]
> {
  const actor = await getCreatorActor();
  return readCreatorEnvironment().CREATOR_BACKEND === "managed"
    ? new NeonCreatorRepository().listOwnedMenus(actor)
    : listOwnedFixtureMenus(actor);
}
