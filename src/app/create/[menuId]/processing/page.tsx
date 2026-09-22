import Link from "next/link";
import { notFound } from "next/navigation";

import { ProcessingStatus } from "@/app/create/[menuId]/processing/processing-status";
import { getOwnedCreatorMenu } from "@/application/creator-read-service";
import { readCreatorEnvironment } from "@/config/env";
import { NeonIngestionRepository } from "@/infrastructure/db/ingestion-repository";

export default async function ProcessingPage(
  props: PageProps<"/create/[menuId]/processing">,
) {
  const { menuId } = await props.params;
  const menu = await getOwnedCreatorMenu(menuId);
  if (!menu) notFound();
  const preflight =
    readCreatorEnvironment().CREATOR_BACKEND === "managed"
      ? await new NeonIngestionRepository().getPreflightAssessment(menuId)
      : null;

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
        initialPreflightGuidance={
          preflight?.issues.map((issue) => issue.guidance) ?? []
        }
        initialState={menu.state}
        menuId={menu.id}
      />
    </main>
  );
}
