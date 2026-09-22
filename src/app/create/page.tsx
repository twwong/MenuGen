import Link from "next/link";

import { UploadForm } from "@/app/create/upload-form";
import { readCreatorEnvironment } from "@/config/env";

export default function CreatePage() {
  const environment = readCreatorEnvironment();
  const enabled = environment.CREATOR_WORKFLOW_ENABLED === "true";

  return (
    <main className="creator-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>
          <span aria-hidden="true" /> Private creator preview
        </p>
      </header>
      <UploadForm enabled={enabled} />
      <footer className="creator-footer">
        <p>Sources are temporary. Result assets expire after 30 days.</p>
        <p>
          Always confirm allergens and safety information with restaurant staff.
        </p>
      </footer>
    </main>
  );
}
