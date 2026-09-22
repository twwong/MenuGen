import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ReviewWorkspace } from "@/app/create/[menuId]/review/review-workspace";
import { getOwnedCreatorMenu } from "@/application/creator-read-service";
import { collectReviewIssues } from "@/application/review-issues";

export default async function ReviewPage(
  props: PageProps<"/create/[menuId]/review">,
) {
  const { menuId } = await props.params;
  const menu = await getOwnedCreatorMenu(menuId);
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
