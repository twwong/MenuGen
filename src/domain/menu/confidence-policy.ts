import {
  menuExtractionV2Schema,
  type MenuExtractionV2,
} from "./menu-extraction";

export const menuConfidencePolicyV2 = {
  version: "2",
  reviewBelow: 0.85,
  rejectBelow: 0.5,
  rejectReviewRatioAtOrAbove: 0.5,
} as const;

export type MenuConfidenceDisposition = "accept" | "review" | "reject";

export interface MenuConfidenceAssessment {
  policyVersion: "2";
  disposition: MenuConfidenceDisposition;
  fieldCount: number;
  reviewFieldCount: number;
  photoReviewFieldCount: number;
  unflaggedLowConfidenceCount: number;
  lowestConfidence: number | null;
  criticalLowestConfidence: number | null;
}

export function assessMenuConfidence(
  input: MenuExtractionV2,
): MenuConfidenceAssessment {
  const menu = menuExtractionV2Schema.parse(input);
  const criticalFields = [
    ...(menu.title ? [menu.title] : []),
    ...menu.sections.flatMap((section) => [
      section.title,
      ...section.items.flatMap((item) => [
        item.name,
        ...(item.description ? [item.description] : []),
        ...(item.price ? [item.price] : []),
      ]),
    ]),
  ];
  const photoFields = menu.sourcePhotoCandidates.flatMap((candidate) => [
    candidate.region,
    candidate.association,
    candidate.usability,
  ]);
  const fields = [...criticalFields, ...photoFields];
  const reviewFieldCount = fields.filter(
    (field) =>
      field.needsReview ||
      field.confidence < menuConfidencePolicyV2.reviewBelow,
  ).length;
  const photoReviewFieldCount = photoFields.filter(
    (field) =>
      field.needsReview ||
      field.confidence < menuConfidencePolicyV2.reviewBelow,
  ).length;
  const unflaggedLowConfidenceCount = fields.filter(
    (field) =>
      field.confidence < menuConfidencePolicyV2.reviewBelow &&
      !field.needsReview,
  ).length;
  const lowestConfidence = fields.length
    ? Math.min(...fields.map((field) => field.confidence))
    : null;
  const criticalLowestConfidence = criticalFields.length
    ? Math.min(...criticalFields.map((field) => field.confidence))
    : null;
  const criticalReviewCount = criticalFields.filter(
    (field) =>
      field.needsReview ||
      field.confidence < menuConfidencePolicyV2.reviewBelow,
  ).length;
  const reviewRatio = criticalFields.length
    ? criticalReviewCount / criticalFields.length
    : 1;
  const shouldReject =
    menu.sections.flatMap((section) => section.items).length === 0 ||
    (criticalLowestConfidence !== null &&
      criticalLowestConfidence < menuConfidencePolicyV2.rejectBelow) ||
    reviewRatio >= menuConfidencePolicyV2.rejectReviewRatioAtOrAbove;

  return {
    policyVersion: "2",
    disposition: shouldReject
      ? "reject"
      : reviewFieldCount > 0
        ? "review"
        : "accept",
    fieldCount: fields.length,
    reviewFieldCount,
    photoReviewFieldCount,
    unflaggedLowConfidenceCount,
    lowestConfidence,
    criticalLowestConfidence,
  };
}
