import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";

import {
  getFixtureCreatorActor,
  getManagedCreatorActor,
} from "@/app/create/session";
import { readCreatorEnvironment } from "@/config/env";
import { NeonGenerationRepository } from "@/infrastructure/db/generation-repository";
import { getFixtureGenerationView } from "@/providers/fixture/fixture-creator-store";

export default async function CreatorResultPage(
  props: PageProps<"/create/[menuId]/result">,
) {
  const { menuId } = await props.params;
  const backend = readCreatorEnvironment().CREATOR_BACKEND;
  const actor =
    backend === "managed"
      ? await getManagedCreatorActor()
      : await getFixtureCreatorActor();
  if (backend === "managed" && !actor.userId) {
    redirect(`/sign-in?returnTo=/create/${menuId}/result`);
  }
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
  const view = fixtureView ?? managedView;
  if (!view?.menu.currentRevision) notFound();
  if (view.menu.state !== "ready") redirect(`/create/${menuId}/generate`);

  const itemState = new Map<
    string,
    {
      provenance: "source" | "generated" | "unavailable" | null;
      activeAssetId: string | null;
    }
  >(
    fixtureView
      ? fixtureView.items.map(
          (item) =>
            [
              item.itemId,
              { provenance: item.provenance, activeAssetId: null },
            ] as const,
        )
      : (managedView?.items.map(
          (item) =>
            [
              item.internalItemId,
              {
                provenance: item.provenance,
                activeAssetId: item.activeAssetId,
              },
            ] as const,
        ) ?? []),
  );
  const menu = view.menu.currentRevision.menu;

  return (
    <main className="creator-shell">
      <header className="creator-header">
        <Link className="brand-link" href="/">
          MenuGen
        </Link>
        <p>Private result · expires {formatDate(view.menu.expiresAt)}</p>
      </header>
      <div className="result-layout">
        <header className="result-heading">
          <p className="eyebrow">Bilingual menu proof</p>
          <h1>{menu.title?.translatedText ?? "Translated menu"}</h1>
          {menu.title ? (
            <p lang={menu.sourceLanguage}>{menu.title.sourceText}</p>
          ) : null}
          <div className="result-notice">
            AI images are visual estimates. They do not show the restaurant’s
            actual plating, portion, or ingredients beyond the printed menu.
          </div>
          <Link className="secondary-link" href="/create/dashboard">
            Back to dashboard
          </Link>
        </header>

        {menu.sections.map((section) => (
          <section className="result-section" key={section.id}>
            <div className="result-section__heading">
              <div>
                <h2>{section.title.translatedText}</h2>
                <p lang={menu.sourceLanguage}>{section.title.sourceText}</p>
              </div>
              <span>{String(section.order + 1).padStart(2, "0")}</span>
            </div>
            <div className="result-grid">
              {section.items.map((item) => {
                const status = itemState.get(item.id);
                return (
                  <article className="result-card" key={item.id}>
                    <div
                      className={`generation-card__image generation-card__image--${status?.provenance ?? "pending"}`}
                    >
                      {status?.activeAssetId ? (
                        <Image
                          alt={`Visual for ${item.name.translatedText}`}
                          fill
                          sizes="(min-width: 40rem) 40vw, 100vw"
                          src={`/api/creator/assets/${status.activeAssetId}`}
                          style={{ objectFit: "cover" }}
                          unoptimized
                        />
                      ) : (
                        <span aria-hidden="true" />
                      )}
                      <small>
                        {status?.provenance === "source"
                          ? "Source menu image"
                          : status?.provenance === "generated"
                            ? "AI visual estimate"
                            : "Image unavailable"}
                      </small>
                    </div>
                    <div className="result-card__copy">
                      <div>
                        <h3>{item.name.translatedText}</h3>
                        <strong>{item.price?.sourceText}</strong>
                      </div>
                      <p lang={menu.sourceLanguage}>{item.name.sourceText}</p>
                      {item.description ? (
                        <>
                          <p>{item.description.translatedText}</p>
                          <p
                            className="proof-item__source"
                            lang={menu.sourceLanguage}
                          >
                            {item.description.sourceText}
                          </p>
                        </>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "pending";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
