import Link from "next/link";

import { DashboardMenus } from "@/app/create/dashboard/dashboard-menus";
import { getFixtureCreatorActor } from "@/app/create/session";
import { getFixtureDashboard } from "@/providers/fixture/fixture-creator-store";

export default async function CreatorDashboardPage() {
  const actor = await getFixtureCreatorActor();
  const dashboard = actor.userId
    ? getFixtureDashboard({ userId: actor.userId })
    : null;

  return (
    <main className="creator-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private creator dashboard</p>
      </header>
      {!dashboard ? (
        <section className="auth-gate">
          <p className="eyebrow">Sign in required</p>
          <h1>Your menus live behind your account.</h1>
          <p>
            Open an anonymous draft and claim it before image generation. The
            deterministic preview creates no external account.
          </p>
          <Link className="primary-button" href="/create">
            Create a menu
          </Link>
        </section>
      ) : (
        <div className="dashboard-layout">
          <section className="dashboard-heading">
            <p className="eyebrow">Your private menus</p>
            <h1>Leave. Come back. Nothing gets lost.</h1>
            <p>
              Active work resumes from its last durable state. Results stay for
              30 days unless you delete them first.
            </p>
            <dl className="generation-facts">
              <div>
                <dt>Generation credits</dt>
                <dd>
                  {dashboard.quota.remaining} of {dashboard.quota.limit}
                </dd>
              </div>
              <div>
                <dt>Next rolling reset</dt>
                <dd>
                  {formatDate(dashboard.quota.nextResetAt) ?? "Not started"}
                </dd>
              </div>
            </dl>
            <Link className="primary-button" href="/create">
              Create another menu
            </Link>
          </section>
          <DashboardMenus menus={dashboard.menus} />
        </div>
      )}
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
