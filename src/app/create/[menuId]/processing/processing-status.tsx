"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CreatorState =
  | "uploading"
  | "preflight"
  | "extracting"
  | "review_ready"
  | "generation_ready"
  | "generating"
  | "ready"
  | "deleting"
  | "deleted"
  | "failed";

const stages = [
  {
    state: "uploading",
    label: "Upload received",
    detail: "Bytes and page order recorded",
  },
  {
    state: "preflight",
    label: "Pages checked",
    detail: "File type, readability, and safety",
  },
  {
    state: "extracting",
    label: "Menu read",
    detail: "Sections, items, prices, and photos",
  },
  {
    state: "review_ready",
    label: "Review prepared",
    detail: "Only uncertain details need attention",
  },
] as const;

const order: CreatorState[] = [
  "uploading",
  "preflight",
  "extracting",
  "review_ready",
  "generation_ready",
  "generating",
  "ready",
  "deleting",
  "deleted",
  "failed",
];

export function ProcessingStatus({
  menuId,
  initialState,
  initialIssueCount,
  initialPreflightGuidance,
}: {
  menuId: string;
  initialState: CreatorState;
  initialIssueCount: number;
  initialPreflightGuidance: readonly string[];
}) {
  const [state, setState] = useState(initialState);
  const [issueCount, setIssueCount] = useState(initialIssueCount);
  const [preflightGuidance, setPreflightGuidance] = useState(
    initialPreflightGuidance,
  );

  useEffect(() => {
    if (
      [
        "review_ready",
        "generation_ready",
        "ready",
        "deleted",
        "failed",
      ].includes(state)
    ) {
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      const response = await fetch(`/api/creator/menus/${menuId}/status`, {
        cache: "no-store",
      });
      if (!cancelled && response.ok) {
        const update = (await response.json()) as {
          state: CreatorState;
          issueCount: number;
          preflightGuidance?: string[];
        };
        setState(update.state);
        setIssueCount(update.issueCount);
        setPreflightGuidance(update.preflightGuidance ?? []);
      }
      if (!cancelled) {
        timer = setTimeout(
          poll,
          document.visibilityState === "visible" ? 2_000 : 8_000,
        );
      }
    }
    timer = setTimeout(poll, 2_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [menuId, state]);

  const currentIndex = order.indexOf(state);
  const readyForReview =
    state === "review_ready" || state === "generation_ready";

  return (
    <div className="processing-layout">
      <section className="processing-sheet" aria-labelledby="processing-title">
        <p className="eyebrow">Preparing your proof</p>
        <h1 id="processing-title">The menu is taking shape.</h1>
        <p className="processing-intro">
          You can leave this page. Work continues safely, and the private draft
          will still be here when you return.
        </p>

        <ol className="processing-stages">
          {stages.map((stage, index) => {
            const complete =
              readyForReview || currentIndex > order.indexOf(stage.state);
            const active = !complete && state === stage.state;
            return (
              <li
                className={complete ? "is-complete" : active ? "is-active" : ""}
                key={stage.state}
              >
                <span aria-hidden="true" className="stage-mark">
                  {complete ? "✓" : String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{stage.label}</strong>
                  <small>{stage.detail}</small>
                </span>
              </li>
            );
          })}
        </ol>

        <div aria-live="polite" className="processing-announcement">
          {state === "failed"
            ? "These pages are not reliable enough to extract safely. No menu facts were guessed."
            : readyForReview
              ? `Review ready. ${issueCount} details need your attention.`
              : "Processing continues. This status checks every few seconds."}
        </div>

        {state === "failed" && preflightGuidance.length > 0 ? (
          <div className="preflight-guidance">
            <h2>Try these recapture fixes</h2>
            <ul>
              {[...new Set(preflightGuidance)].map((guidance) => (
                <li key={guidance}>{guidance}</li>
              ))}
            </ul>
            <Link className="primary-button" href="/create">
              Retake menu pages
            </Link>
          </div>
        ) : null}

        {readyForReview ? (
          <Link
            className="primary-button primary-button--link"
            href={`/create/${menuId}/review`}
          >
            Review {issueCount} {issueCount === 1 ? "detail" : "details"}
          </Link>
        ) : null}
      </section>

      <aside className="processing-aside">
        <p className="folio">MENU PROOF · PRIVATE</p>
        <div className="proof-lines" aria-hidden="true">
          <span className="proof-line proof-line--long" />
          <span className="proof-line" />
          <span className="proof-line proof-line--short" />
          <span className="proof-image" />
          <span className="proof-line proof-line--long" />
          <span className="proof-line proof-line--short" />
        </div>
        <p>
          Source wording remains the record. Translations and images stay
          visibly separate from it.
        </p>
      </aside>
    </div>
  );
}
