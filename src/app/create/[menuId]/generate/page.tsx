import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { GenerationWorkspace } from "@/app/create/[menuId]/generate/generation-workspace";
import {
  getFixtureCreatorActor,
  getManagedCreatorActor,
} from "@/app/create/session";
import { getOwnedCreatorMenu } from "@/application/creator-read-service";
import { readCreatorEnvironment } from "@/config/env";
import { NeonGenerationRepository } from "@/infrastructure/db/generation-repository";
import { getFixtureGenerationView } from "@/providers/fixture/fixture-creator-store";

export default async function GeneratePage(
  props: PageProps<"/create/[menuId]/generate">,
) {
  const { menuId } = await props.params;
  const backend = readCreatorEnvironment().CREATOR_BACKEND;
  const actor =
    backend === "managed"
      ? await getManagedCreatorActor()
      : await getFixtureCreatorActor();
  const fixtureView =
    backend === "fixture"
      ? getFixtureGenerationView({ menuId, ...actor })
      : null;
  const managedView =
    backend === "managed" && actor.userId
      ? await new NeonGenerationRepository().getOwnedGenerationView({
          menuId,
          userId: actor.userId,
        })
      : null;
  const anonymousManagedMenu =
    backend === "managed" && !actor.userId
      ? await getOwnedCreatorMenu(menuId)
      : null;
  const menu =
    fixtureView?.menu ?? managedView?.menu ?? anonymousManagedMenu ?? null;
  if (!menu?.currentRevision) notFound();
  if (menu.state === "review_ready") redirect(`/create/${menuId}/review`);

  const itemNames = Object.fromEntries(
    menu.currentRevision.menu.sections.flatMap((section) =>
      section.items.map((item) => [
        managedView?.items.find(
          (viewItem) => viewItem.internalItemId === item.id,
        )?.publicId ?? item.id,
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
        backend={backend}
        initialView={{
          state: menu.state,
          items:
            fixtureView?.items ??
            managedView?.items.map((item) => ({
              itemId: item.publicId,
              state: item.state,
              provenance: item.provenance,
              sanitizedErrorCode: item.sanitizedErrorCode,
              regenerationCount: item.regenerationCount,
            })) ??
            [],
          quota: fixtureView?.quota ?? managedView?.quota ?? null,
          estimatedCostUsd:
            fixtureView?.estimatedCostUsd ?? managedView?.estimatedCostUsd ?? 0,
          expiresAt: menu.expiresAt,
        }}
        itemNames={itemNames}
        menuId={menuId}
        signedIn={Boolean(actor.userId)}
      />
    </main>
  );
}
