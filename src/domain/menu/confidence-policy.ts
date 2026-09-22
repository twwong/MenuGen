import {
  menuExtractionV1Schema,
  type MenuExtractionV1,
} from "./menu-extraction";

export const menuConfidencePolicyV1 = {
  version: "1",
  reviewBelow: 0.85,
  rejectBelow: 0.5,
  rejectReviewRatioAtOrAbove: 0.5,
} as const;

export type MenuConfidenceDisposition = "accept" | "review" | "reject";

export interface MenuConfidenceAssessment {
  policyVersion: "1";
  disposition: MenuConfidenceDisposition;
  fieldCount: number;
  reviewFieldCount: number;
  unflaggedLowConfidenceCount: number;
  lowestConfidence: number | null;
}

export function assessMenuConfidence(
  input: MenuExtractionV1,
): MenuConfidenceAssessment {
  const menu = menuExtractionV1Schema.parse(input);
  const fields = [
    ...(menu.title ? [menu.title] : []),
    ...menu.sections.flatMap((section) => [
      section.title,
      ...section.items.flatMap((item) => [
        item.name,
        ...(item.description ? [item.description] : []),
      ]),
    ]),
  ];
  const reviewFieldCount = fields.filter(
    (field) =>
      field.needsReview ||
      field.confidence < menuConfidencePolicyV1.reviewBelow,
  ).length;
  const unflaggedLowConfidenceCount = fields.filter(
    (field) =>
      field.confidence < menuConfidencePolicyV1.reviewBelow &&
      !field.needsReview,
  ).length;
  const lowestConfidence = fields.length
    ? Math.min(...fields.map((field) => field.confidence))
    : null;
  const reviewRatio = fields.length ? reviewFieldCount / fields.length : 1;
  const shouldReject =
    menu.sections.flatMap((section) => section.items).length === 0 ||
    (lowestConfidence !== null &&
      lowestConfidence < menuConfidencePolicyV1.rejectBelow) ||
    reviewRatio >= menuConfidencePolicyV1.rejectReviewRatioAtOrAbove;

  return {
    policyVersion: "1",
    disposition: shouldReject
      ? "reject"
      : reviewFieldCount > 0
        ? "review"
        : "accept",
    fieldCount: fields.length,
    reviewFieldCount,
    unflaggedLowConfidenceCount,
    lowestConfidence,
  };
}
