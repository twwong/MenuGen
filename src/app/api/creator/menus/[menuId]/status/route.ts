import { cookies } from "next/headers";

import { ANONYMOUS_DRAFT_COOKIE } from "@/application/ownership";
import { getOwnedFixtureMenu } from "@/providers/fixture/fixture-creator-store";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/creator/menus/[menuId]/status">,
) {
  const { menuId } = await context.params;
  const cookieStore = await cookies();
  const menu = getOwnedFixtureMenu({
    menuId,
    anonymousToken: cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value ?? null,
    userId: null,
  });
  if (!menu) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }
  return Response.json(
    {
      id: menu.id,
      state: menu.state,
      issueCount: menu.issueCount,
      completedItemCount: menu.completedItemCount,
      totalItemCount: menu.totalItemCount,
      updatedAt: menu.updatedAt,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
