import Link from "next/link";
import { redirect } from "next/navigation";

import { claimManagedDraftAction } from "@/app/create/actions";
import { getManagedCreatorActor } from "@/app/create/session";
import { readCreatorEnvironment } from "@/config/env";

export default async function ClaimDraftPage(
  props: PageProps<"/create/[menuId]/claim">,
) {
  const { menuId } = await props.params;
  if (readCreatorEnvironment().CREATOR_BACKEND !== "managed") {
    redirect(`/create/${menuId}/generate`);
  }
  const actor = await getManagedCreatorActor();
  if (!actor.userId) redirect(`/sign-in?returnTo=/create/${menuId}/claim`);

  return (
    <main className="creator-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private draft claim</p>
      </header>
      <section className="auth-gate">
        <p className="eyebrow">Signed in</p>
        <h1>Attach this draft to your account.</h1>
        <p>
          Claiming is atomic: the anonymous token is invalidated, so another
          session cannot take the same draft.
        </p>
        <form action={claimManagedDraftAction.bind(null, menuId)}>
          <button className="primary-button" type="submit">
            Claim and continue
          </button>
        </form>
      </section>
    </main>
  );
}
