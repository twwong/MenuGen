"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import {
  completeReviewAction,
  resolveReviewIssueAction,
} from "@/app/create/actions";
import type { ReviewIssue } from "@/application/review-issues";
import type { MenuDraftV1 } from "@/domain/creator/revisions";

export function ReviewWorkspace({
  draft,
  issues,
}: {
  draft: MenuDraftV1;
  issues: readonly ReviewIssue[];
}) {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const items = useMemo(
    () => draft.menu.sections.flatMap((section) => section.items),
    [draft],
  );

  function resolvePrice(issue: ReviewIssue, value: string) {
    if (!issue.sectionId || !issue.itemId || !value.trim()) return;
    run(async () => {
      await resolveReviewIssueAction({
        menuId: draft.menuId,
        previousRevisionId: draft.revisionId,
        issueId: issue.id,
        acceptUncertainty: false,
        patch: {
          correctionId: crypto.randomUUID(),
          correctedAt: new Date().toISOString(),
          actor: "anonymous_owner",
          actorId: null,
          reason: "Uploader confirmed the visible price",
          kind: "field",
          sectionId: issue.sectionId,
          itemId: issue.itemId,
          field: "price",
          value: value.trim(),
        },
      });
    });
  }

  function resolvePhoto(issue: ReviewIssue, itemId: string | null) {
    if (!issue.candidateId) return;
    run(async () => {
      await resolveReviewIssueAction({
        menuId: draft.menuId,
        previousRevisionId: draft.revisionId,
        issueId: issue.id,
        acceptUncertainty: itemId === null,
        patch: {
          correctionId: crypto.randomUUID(),
          correctedAt: new Date().toISOString(),
          actor: "anonymous_owner",
          actorId: null,
          reason: itemId
            ? "Uploader linked the source photo"
            : "Uploader left the ambiguous photo unassociated",
          kind: "photo_association",
          candidateId: issue.candidateId,
          itemId,
        },
      });
    });
  }

  function run(operation: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await operation();
        router.refresh();
      } catch {
        setError(
          "That correction could not be saved. Refresh the draft and try again.",
        );
        queueMicrotask(() => errorRef.current?.focus());
      }
    });
  }

  function finishReview() {
    run(async () => {
      await completeReviewAction(draft.menuId);
      router.push(`/create/${draft.menuId}/generate`);
    });
  }

  return (
    <div className="review-layout">
      <aside className="issue-rail" aria-labelledby="issues-heading">
        <p className="eyebrow">Exception review</p>
        <h1 id="issues-heading">
          {issues.length}{" "}
          {issues.length === 1 ? "detail needs" : "details need"} a look.
        </h1>
        <p>
          Everything else is already preserved. Fix only what the scan could not
          read confidently.
        </p>
        <nav aria-label="Review issues">
          <ol>
            {issues.map((issue, index) => (
              <li key={issue.id}>
                <a href={`#issue-${encodeURIComponent(issue.id)}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {issue.label}
                  <small>
                    {Math.round(issue.confidence * 100)}% confidence
                  </small>
                </a>
              </li>
            ))}
          </ol>
        </nav>
        {issues.length === 0 ? (
          <div className="review-clear">
            <strong>Ready for images</strong>
            <p>The record is saved as a new revision.</p>
          </div>
        ) : null}
      </aside>

      <section className="menu-proof" aria-label="Extracted menu proof">
        <header className="menu-proof__header">
          <div>
            <p className="folio">
              REVISION {String(draft.revisionNumber).padStart(2, "0")}
            </p>
            <h2>{draft.menu.title?.translatedText ?? "Untitled menu"}</h2>
            {draft.menu.title ? (
              <p lang={draft.menu.sourceLanguage}>
                {draft.menu.title.sourceText}
              </p>
            ) : null}
          </div>
          <span>{draft.menu.targetLanguage.toUpperCase()}</span>
        </header>

        {draft.menu.sections.map((section) => (
          <section className="menu-section" key={section.id}>
            <div className="menu-section__title">
              <h3>{section.title.translatedText}</h3>
              <p lang={draft.menu.sourceLanguage}>{section.title.sourceText}</p>
            </div>
            {section.items.map((item) => {
              const priceIssue = issues.find(
                (issue) => issue.itemId === item.id && issue.kind === "price",
              );
              const confidentPhoto = draft.menu.sourcePhotoCandidates.some(
                (candidate) =>
                  candidate.association.itemId === item.id &&
                  !candidate.association.needsReview &&
                  candidate.usability.status === "usable",
              );
              return (
                <article
                  className="proof-item"
                  id={
                    priceIssue
                      ? `issue-${encodeURIComponent(priceIssue.id)}`
                      : undefined
                  }
                  key={item.id}
                >
                  <div
                    className={`proof-item__image ${confidentPhoto ? "proof-item__image--source" : ""}`}
                  >
                    <span aria-hidden="true" />
                    <small>
                      {confidentPhoto
                        ? "Source menu image"
                        : "Image after review"}
                    </small>
                  </div>
                  <div className="proof-item__copy">
                    <div className="proof-item__heading">
                      <div>
                        <h4>{item.name.translatedText}</h4>
                        <p lang={draft.menu.sourceLanguage}>
                          {item.name.sourceText}
                        </p>
                      </div>
                      {!priceIssue ? (
                        <strong>{item.price?.sourceText}</strong>
                      ) : null}
                    </div>
                    {item.description ? (
                      <>
                        <p className="proof-item__description">
                          {item.description.translatedText}
                        </p>
                        <p
                          className="proof-item__source"
                          lang={draft.menu.sourceLanguage}
                        >
                          {item.description.sourceText}
                        </p>
                      </>
                    ) : null}
                    {priceIssue ? (
                      <PriceIssue
                        disabled={isPending}
                        initialValue={item.price?.sourceText ?? ""}
                        issue={priceIssue}
                        onSave={resolvePrice}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ))}

        {issues
          .filter((issue) => issue.kind === "photo_association")
          .map((issue) => (
            <div
              className="photo-issue"
              id={`issue-${encodeURIComponent(issue.id)}`}
              key={issue.id}
            >
              <div
                className="photo-issue__preview"
                aria-label="Ambiguous source-menu photo candidate"
                role="img"
              >
                <span />
              </div>
              <div>
                <p className="eyebrow">Photo association</p>
                <h3>Which item does this photo show?</h3>
                <p>
                  Proximity alone is not enough. Leave it unassociated if the
                  menu does not make the link clear.
                </p>
                <div className="photo-issue__actions">
                  {items.map((item) => (
                    <button
                      disabled={isPending}
                      key={item.id}
                      onClick={() => resolvePhoto(issue, item.id)}
                      type="button"
                    >
                      {item.name.translatedText}
                    </button>
                  ))}
                  <button
                    className="quiet-button"
                    disabled={isPending}
                    onClick={() => resolvePhoto(issue, null)}
                    type="button"
                  >
                    Leave unassociated
                  </button>
                </div>
              </div>
            </div>
          ))}

        {error ? (
          <div className="form-error" ref={errorRef} role="alert" tabIndex={-1}>
            {error}
          </div>
        ) : null}

        <footer className="review-footer">
          <p>
            {issues.length === 0
              ? "All exceptions handled."
              : `${issues.length} exceptions remain.`}
          </p>
          <button
            className="primary-button"
            disabled={issues.length > 0 || isPending}
            onClick={finishReview}
            type="button"
          >
            Continue to images
          </button>
        </footer>
      </section>
    </div>
  );
}

function PriceIssue({
  issue,
  initialValue,
  disabled,
  onSave,
}: {
  issue: ReviewIssue;
  initialValue: string;
  disabled: boolean;
  onSave: (issue: ReviewIssue, value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <div className="inline-issue">
      <label htmlFor={`price-${issue.itemId}`}>
        Confirm price exactly as printed
      </label>
      <div>
        <input
          disabled={disabled}
          id={`price-${issue.itemId}`}
          onChange={(event) => setValue(event.target.value)}
          value={value}
        />
        <button
          disabled={disabled || !value.trim()}
          onClick={() => onSave(issue, value)}
          type="button"
        >
          Save price
        </button>
      </div>
      <small>
        Low confidence · original characters stay unchanged until you save.
      </small>
    </div>
  );
}
