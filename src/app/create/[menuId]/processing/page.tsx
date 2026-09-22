import Link from "next/link";
import { notFound } from "next/navigation";

import { ProcessingStatus } from "@/app/create/[menuId]/processing/processing-status";
import { getFixtureCreatorActor } from "@/app/create/session";
import { getOwnedFixtureMenu } from "@/providers/fixture/fixture-creator-store";

export default async function ProcessingPage(
  props: PageProps<"/create/[menuId]/processing">,
) {
  const { menuId } = await props.params;
  const actor = await getFixtureCreatorActor();
  const menu = getOwnedFixtureMenu({
    menuId,
    ...actor,
  });
  if (!menu) notFound();

  return (
    <main className="creator-shell creator-shell--processing">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private draft · autosaved</p>
      </header>
      <ProcessingStatus
        initialIssueCount={menu.issueCount}
        initialState={menu.state}
        menuId={menu.id}
      />
    </main>
  );
}
