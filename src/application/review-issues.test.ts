import { describe, expect, it } from "vitest";

import { collectReviewIssues } from "@/application/review-issues";
import { menuDraftV1Schema } from "@/domain/creator/revisions";
import { createCreatorMenuFixture } from "@/providers/fixture/creator-menu-fixture";

describe("collectReviewIssues", () => {
  it("finds uncertain prices and ambiguous source photos only", () => {
    const draft = menuDraftV1Schema.parse({
      schemaVersion: "1",
      menuId: "78b51473-88d8-4c9a-9949-a279ad123876",
      revisionId: "6679c305-e170-44f4-8461-e64cdd84d521",
      revisionNumber: 1,
      basedOnRevisionId: null,
      createdAt: "2026-09-22T00:00:00.000Z",
      menu: createCreatorMenuFixture("en"),
      corrections: [],
      reviewResolutions: [],
    });

    expect(collectReviewIssues(draft).map((issue) => issue.kind)).toEqual([
      "price",
      "photo_association",
    ]);
  });

  it("keeps uncertainty in the data while honoring an explicit resolution", () => {
    const draft = menuDraftV1Schema.parse({
      schemaVersion: "1",
      menuId: "78b51473-88d8-4c9a-9949-a279ad123876",
      revisionId: "6679c305-e170-44f4-8461-e64cdd84d521",
      revisionNumber: 1,
      basedOnRevisionId: null,
      createdAt: "2026-09-22T00:00:00.000Z",
      menu: createCreatorMenuFixture("en"),
      corrections: [],
      reviewResolutions: [
        {
          issueId: "photo:photo-ambiguous",
          status: "accepted_uncertainty",
          resolvedAt: "2026-09-22T00:01:00.000Z",
          correctionId: null,
        },
      ],
    });

    expect(collectReviewIssues(draft)).toHaveLength(1);
    expect(
      draft.menu.sourcePhotoCandidates.find(
        (candidate) => candidate.id === "photo-ambiguous",
      )?.association.needsReview,
    ).toBe(true);
  });
});
