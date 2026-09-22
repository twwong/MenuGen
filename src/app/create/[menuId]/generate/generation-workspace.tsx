"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  claimFixtureDraftAction,
  confirmFixtureGenerationAction,
  regenerateFixtureItemAction,
} from "@/app/create/actions";

type MenuState =
  | "generation_ready"
  | "generating"
  | "ready"
  | "failed"
  | "deleting"
  | "deleted"
  | string;

type ItemState =
  | "pending"
  | "source_photo_ready"
  | "generation_eligible"
  | "generating"
  | "generated"
  | "failed"
  | "not_eligible";

interface GenerationItem {
  itemId: string;
  state: ItemState;
  provenance: "source" | "generated" | "unavailable" | null;
  sanitizedErrorCode: string | null;
  regenerationCount: number;
}

interface QuotaView {
  limit: number;
  consumed: number;
  reserved: number;
  remaining: number;
  nextResetAt: string | null;
}

interface GenerationView {
  state: MenuState;
  items: readonly GenerationItem[];
  quota: QuotaView | null;
  estimatedCostUsd: number;
  expiresAt: string | null;
}

export function GenerationWorkspace({
  menuId,
  signedIn,
  itemNames,
  initialView,
}: {
  menuId: string;
  signedIn: boolean;
  itemNames: Record<string, { translated: string; source: string }>;
  initialView: GenerationView;
}) {
  const router = useRouter();
  const [view, setView] = useState(initialView);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (view.state !== "generating") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const response = await fetch(`/api/creator/menus/${menuId}/status`, {
        cache: "no-store",
      });
      if (!cancelled && response.ok) {
        const update = (await response.json()) as GenerationView;
        setView(update);
      }
      if (!cancelled) {
        timer = setTimeout(
          poll,
          document.visibilityState === "visible" ? 2_000 : 8_000,
        );
      }
    }
    timer = setTimeout(poll, 500);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [menuId, view.state]);

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        const response = await fetch(`/api/creator/menus/${menuId}/status`, {
          cache: "no-store",
        });
        if (response.ok) setView((await response.json()) as GenerationView);
      } catch (caught) {
        setError(messageForError(caught));
      }
    });
  }

  if (!signedIn) {
    return (
      <section className="auth-gate" aria-labelledby="auth-title">
        <p className="eyebrow">Sign in before paid work</p>
        <h1 id="auth-title">Keep this menu and make its images.</h1>
        <p>
          This local proof uses a private preview identity. The managed preview
          uses Clerk email codes or Google. Claiming the draft does not spend a
          generation credit.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-button"
          disabled={isPending}
          onClick={() => run(() => claimFixtureDraftAction(menuId))}
          type="button"
        >
          {isPending ? "Claiming draft…" : "Continue as preview diner"}
        </button>
        <p className="preview-lock">
          The anonymous ownership token is invalidated after the claim.
        </p>
      </section>
    );
  }

  const quota = view.quota;
  const ready = view.state === "ready";
  const generating = view.state === "generating";

  return (
    <div className="generation-layout">
      <section
        className="generation-summary"
        aria-labelledby="generation-title"
      >
        <p className="eyebrow">
          {ready ? "Private result" : "Image generation"}
        </p>
        <h1 id="generation-title">
          {ready
            ? "Your visual menu is ready."
            : generating
              ? "Images are joining the menu."
              : "Ready when you are."}
        </h1>
        <p className="generation-lede">
          Source photos are reused only when the association is confident.
          Generated pictures are estimates, never claims about the restaurant’s
          plating.
        </p>

        <dl className="generation-facts">
          <div>
            <dt>Credits remaining</dt>
            <dd>
              {quota?.remaining ?? "—"} of {quota?.limit ?? 3}
            </dd>
          </div>
          <div>
            <dt>Estimated provider cost</dt>
            <dd>${view.estimatedCostUsd.toFixed(2)}</dd>
          </div>
          <div>
            <dt>Result expires</dt>
            <dd>{formatDate(view.expiresAt) ?? "After completion"}</dd>
          </div>
        </dl>

        {view.state === "generation_ready" ? (
          <div className="generation-confirmation">
            <h2>Confirm one menu credit</h2>
            <p>
              One credit is reserved now and consumed immediately before the
              first generated-image request. If no provider request starts, the
              reservation is released.
            </p>
            {error ? <p className="form-error">{error}</p> : null}
            <button
              className="primary-button"
              disabled={isPending || (quota?.remaining ?? 0) < 1}
              onClick={() => run(() => confirmFixtureGenerationAction(menuId))}
              type="button"
            >
              {isPending ? "Reserving credit…" : "Use 1 credit and generate"}
            </button>
          </div>
        ) : null}

        <div aria-live="polite" className="processing-announcement">
          {generating
            ? progressMessage(view.items)
            : ready
              ? completionMessage(view.items)
              : "No paid provider request has started."}
        </div>

        {ready ? (
          <div className="generation-links">
            <Link className="primary-button" href={`/create/${menuId}/result`}>
              Open private result
            </Link>
            <Link className="secondary-link" href="/create/dashboard">
              View dashboard
            </Link>
          </div>
        ) : null}
      </section>

      <section className="generation-items" aria-label="Menu image progress">
        {view.items.map((item) => {
          const name = itemNames[item.itemId] ?? {
            translated: "Menu item",
            source: "",
          };
          return (
            <article className="generation-card" key={item.itemId}>
              <div
                className={`generation-card__image generation-card__image--${item.provenance ?? "pending"}`}
              >
                <span aria-hidden="true" />
                {item.provenance === "source" ? (
                  <small>Source menu image</small>
                ) : item.provenance === "generated" ? (
                  <small>AI visual estimate</small>
                ) : item.state === "failed" ? (
                  <small>Image unavailable</small>
                ) : (
                  <small>{itemStatus(item.state)}</small>
                )}
              </div>
              <div>
                <p className="folio">{itemStatus(item.state)}</p>
                <h2>{name.translated}</h2>
                <p lang="ja">{name.source}</p>
                {item.state === "failed" ? (
                  <>
                    <p className="generation-card__error">
                      This item failed without stopping the rest of the menu.
                    </p>
                    <button
                      className="quiet-button"
                      disabled={isPending || item.regenerationCount >= 2}
                      onClick={() =>
                        run(() =>
                          regenerateFixtureItemAction({
                            menuId,
                            itemId: item.itemId,
                          }),
                        )
                      }
                      type="button"
                    >
                      {item.regenerationCount >= 2
                        ? "Regeneration limit reached"
                        : `Try again · ${2 - item.regenerationCount} left`}
                    </button>
                    <small className="sanitized-code">
                      Reference: {item.sanitizedErrorCode}
                    </small>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function itemStatus(state: ItemState) {
  const labels: Record<ItemState, string> = {
    pending: "Waiting",
    source_photo_ready: "Source photo ready",
    generation_eligible: "Queued",
    generating: "Generating",
    generated: "Generated",
    failed: "Needs attention",
    not_eligible: "No image needed",
  };
  return labels[state];
}

function progressMessage(items: readonly GenerationItem[]) {
  const complete = items.filter((item) =>
    ["source_photo_ready", "generated", "failed", "not_eligible"].includes(
      item.state,
    ),
  ).length;
  return `${complete} of ${items.length} items finished. You can leave and return.`;
}

function completionMessage(items: readonly GenerationItem[]) {
  const failed = items.filter((item) => item.state === "failed").length;
  return failed === 0
    ? "Every item finished."
    : `${items.length - failed} items finished; ${failed} has a visible placeholder.`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function messageForError(error: unknown) {
  const code = error instanceof Error ? error.message : "unknown_error";
  if (code.includes("quota_exhausted")) return "No menu credits remain.";
  if (code.includes("regeneration_limit_reached")) {
    return "This item has used both regeneration attempts.";
  }
  if (code.includes("draft_claim_conflict")) {
    return "This draft was already claimed in another session.";
  }
  return "That action did not finish. Please try again.";
}
