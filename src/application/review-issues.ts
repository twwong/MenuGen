import type { MenuDraftV1 } from "@/domain/creator/revisions";

export interface ReviewIssue {
  id: string;
  kind:
    | "source_text"
    | "translation"
    | "price"
    | "photo_association"
    | "eligibility";
  label: string;
  sectionId: string | null;
  itemId: string | null;
  candidateId: string | null;
  confidence: number;
}

export function collectReviewIssues(draft: MenuDraftV1): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  for (const section of draft.menu.sections) {
    if (section.title.needsReview) {
      issues.push(
        issue(
          `section:${section.id}:title`,
          "source_text",
          "Check section title",
          section.id,
          null,
          section.title.confidence,
        ),
      );
    }
    for (const item of section.items) {
      if (item.name.needsReview) {
        issues.push(
          issue(
            `item:${item.id}:name`,
            "source_text",
            "Check item name",
            section.id,
            item.id,
            item.name.confidence,
          ),
        );
      }
      if (item.description?.needsReview) {
        issues.push(
          issue(
            `item:${item.id}:description`,
            "translation",
            "Check item description",
            section.id,
            item.id,
            item.description.confidence,
          ),
        );
      }
      if (item.price?.needsReview) {
        issues.push(
          issue(
            `item:${item.id}:price`,
            "price",
            "Confirm the price",
            section.id,
            item.id,
            item.price.confidence,
          ),
        );
      }
      if (item.imageEligibility === "needs_review") {
        issues.push(
          issue(
            `item:${item.id}:eligibility`,
            "eligibility",
            "Choose image eligibility",
            section.id,
            item.id,
            0,
          ),
        );
      }
    }
  }
  for (const candidate of draft.menu.sourcePhotoCandidates) {
    if (
      candidate.region.needsReview ||
      candidate.association.needsReview ||
      candidate.usability.needsReview
    ) {
      issues.push({
        id: `photo:${candidate.id}`,
        kind: "photo_association",
        label: "Review source photo",
        sectionId: null,
        itemId: candidate.association.itemId,
        candidateId: candidate.id,
        confidence: Math.min(
          candidate.region.confidence,
          candidate.association.confidence,
          candidate.usability.confidence,
        ),
      });
    }
  }
  const resolved = new Set(
    draft.reviewResolutions.map((entry) => entry.issueId),
  );
  return issues.filter((entry) => !resolved.has(entry.id));
}

function issue(
  id: string,
  kind: ReviewIssue["kind"],
  label: string,
  sectionId: string,
  itemId: string | null,
  confidence: number,
): ReviewIssue {
  return {
    id,
    kind,
    label,
    sectionId,
    itemId,
    candidateId: null,
    confidence,
  };
}
