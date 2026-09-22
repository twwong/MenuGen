import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ProcessingStatus } from "@/app/create/[menuId]/processing/processing-status";
import { ANONYMOUS_DRAFT_COOKIE } from "@/application/ownership";
import { getOwnedFixtureMenu } from "@/providers/fixture/fixture-creator-store";

export default async function ProcessingPage(
  props: PageProps<"/create/[menuId]/processing">,
) {
  const { menuId } = await props.params;
  const cookieStore = await cookies();
  const menu = getOwnedFixtureMenu({
    menuId,
    anonymousToken: cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value ?? null,
    userId: null,
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
