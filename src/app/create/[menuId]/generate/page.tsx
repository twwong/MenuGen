import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GenerationWorkspace } from "@/app/create/[menuId]/generate/generation-workspace";
import { getFixtureCreatorActor } from "@/app/create/session";
import { getFixtureGenerationView } from "@/providers/fixture/fixture-creator-store";

export default async function GeneratePage(
  props: PageProps<"/create/[menuId]/generate">,
) {
  const { menuId } = await props.params;
  const actor = await getFixtureCreatorActor();
  const view = getFixtureGenerationView({ menuId, ...actor });
  if (!view?.menu.currentRevision) notFound();
  if (view.menu.state === "review_ready") redirect(`/create/${menuId}/review`);

  const itemNames = Object.fromEntries(
    view.menu.currentRevision.menu.sections.flatMap((section) =>
      section.items.map((item) => [
        item.id,
        {
          translated: item.name.translatedText,
          source: item.name.sourceText,
        },
      ]),
    ),
  );

  return (
    <main className="creator-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private draft · review saved</p>
      </header>
      <GenerationWorkspace
        initialView={{
          state: view.menu.state,
          items: view.items,
          quota: view.quota,
          estimatedCostUsd: view.estimatedCostUsd,
          expiresAt: view.menu.expiresAt,
        }}
        itemNames={itemNames}
        menuId={menuId}
        signedIn={Boolean(actor.userId)}
      />
    </main>
  );
}
