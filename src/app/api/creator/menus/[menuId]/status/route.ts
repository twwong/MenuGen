import { getFixtureCreatorActor } from "@/app/create/session";
import { getCreatorActor } from "@/app/create/session";
import { readCreatorEnvironment } from "@/config/env";
import { NeonCreatorRepository } from "@/infrastructure/db/creator-repository";
import { NeonGenerationRepository } from "@/infrastructure/db/generation-repository";
import { NeonIngestionRepository } from "@/infrastructure/db/ingestion-repository";
import { getFixtureGenerationView } from "@/providers/fixture/fixture-creator-store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/creator/menus/[menuId]/status">,
) {
  const { menuId } = await context.params;
  const environment = readCreatorEnvironment();
  const actor = await getCreatorActor();
  if (environment.CREATOR_BACKEND === "managed") {
    const menu = await new NeonCreatorRepository().getOwnedMenu(menuId, actor);
    if (!menu) {
      return Response.json({ code: "not_found" }, { status: 404 });
    }
    const generation = actor.userId
      ? await new NeonGenerationRepository().getOwnedGenerationView({
          menuId,
          userId: actor.userId,
        })
      : null;
    const preflight =
      await new NeonIngestionRepository().getPreflightAssessment(menuId);
    return Response.json(
      {
        id: menu.id,
        state: menu.state,
        issueCount: menu.issueCount,
        completedItemCount: menu.completedItemCount,
        totalItemCount: menu.totalItemCount,
        updatedAt: menu.updatedAt,
        expiresAt: menu.expiresAt,
        items:
          generation?.items.map((item) => ({
            itemId: item.publicId,
            state: item.state,
            provenance: item.provenance,
            sanitizedErrorCode: item.sanitizedErrorCode,
            regenerationCount: item.regenerationCount,
          })) ?? [],
        quota: generation?.quota ?? null,
        estimatedCostUsd: generation?.estimatedCostUsd ?? 0,
        preflightGuidance:
          preflight?.issues.map((issue) => issue.guidance) ?? [],
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const fixtureActor = await getFixtureCreatorActor();
  const view = getFixtureGenerationView({
    menuId,
    ...fixtureActor,
  });
  if (!view) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }
  const { menu } = view;
  return Response.json(
    {
      id: menu.id,
      state: menu.state,
      issueCount: menu.issueCount,
      completedItemCount: menu.completedItemCount,
      totalItemCount: menu.totalItemCount,
      updatedAt: menu.updatedAt,
      expiresAt: menu.expiresAt,
      items: view.items,
      quota: view.quota,
      estimatedCostUsd: view.estimatedCostUsd,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
