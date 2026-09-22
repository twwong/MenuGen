import { getFixtureCreatorActor } from "@/app/create/session";
import { getFixtureGenerationView } from "@/providers/fixture/fixture-creator-store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/creator/menus/[menuId]/status">,
) {
  const { menuId } = await context.params;
  const actor = await getFixtureCreatorActor();
  const view = getFixtureGenerationView({
    menuId,
    ...actor,
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
