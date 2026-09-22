import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ANONYMOUS_DRAFT_COOKIE } from "@/application/ownership";
import { getOwnedFixtureMenu } from "@/providers/fixture/fixture-creator-store";

export default async function GeneratePage(
  props: PageProps<"/create/[menuId]/generate">,
) {
  const { menuId } = await props.params;
  const cookieStore = await cookies();
  const menu = getOwnedFixtureMenu({
    menuId,
    anonymousToken: cookieStore.get(ANONYMOUS_DRAFT_COOKIE)?.value ?? null,
    userId: null,
  });
  if (!menu) notFound();
  if (menu.state === "review_ready") redirect(`/create/${menuId}/review`);

  return (
    <main className="creator-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private draft · review saved</p>
      </header>
      <section className="auth-gate">
        <p className="eyebrow">Next · Image generation</p>
        <h1>Your menu record is ready.</h1>
        <p>
          Sign-in, credit reservation, and durable image generation land in the
          next verified slice. No paid image request has started.
        </p>
        <dl>
          <div>
            <dt>Draft state</dt>
            <dd>Review complete</dd>
          </div>
          <div>
            <dt>Credit used</dt>
            <dd>None</dd>
          </div>
          <div>
            <dt>Source retention</dt>
            <dd>Cleanup pending</dd>
          </div>
        </dl>
        <Link className="secondary-link" href="/create">
          Start another draft
        </Link>
      </section>
    </main>
  );
}
