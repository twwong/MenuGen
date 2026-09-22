import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReviewWorkspace } from "@/app/create/[menuId]/review/review-workspace";
import { getFixtureCreatorActor } from "@/app/create/session";
import { collectReviewIssues } from "@/application/review-issues";
import { getOwnedFixtureMenu } from "@/providers/fixture/fixture-creator-store";

export default async function ReviewPage(
  props: PageProps<"/create/[menuId]/review">,
) {
  const { menuId } = await props.params;
  const actor = await getFixtureCreatorActor();
  const menu = getOwnedFixtureMenu({
    menuId,
    ...actor,
  });
  if (!menu?.currentRevision) notFound();
  if (menu.state === "generation_ready") redirect(`/create/${menuId}/generate`);
  if (menu.state !== "review_ready") redirect(`/create/${menuId}/processing`);

  return (
    <main className="creator-shell creator-shell--review">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private proof · revision {menu.currentRevision.revisionNumber}</p>
      </header>
      <ReviewWorkspace
        draft={menu.currentRevision}
        issues={collectReviewIssues(menu.currentRevision)}
      />
    </main>
  );
}
