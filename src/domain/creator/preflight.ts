import { z } from "zod";

export const preflightIssueCodeSchema = z.enum([
  "blur",
  "glare",
  "perspective",
  "handwriting",
  "decorative_layout",
  "incomplete_coverage",
  "low_resolution",
  "encrypted_pdf",
  "unsupported_format",
  "page_limit",
  "file_size_limit",
  "total_size_limit",
  "decompression_limit",
  "malware",
]);

export const preflightIssueSchema = z
  .object({
    code: preflightIssueCodeSchema,
    severity: z.enum(["review", "reject"]),
    sourceFileOrder: z.number().int().nonnegative().nullable(),
    pageIndex: z.number().int().nonnegative().nullable(),
    confidence: z.number().min(0).max(1),
    guidance: z.string().min(1).max(280),
  })
  .strict();

export const preflightAssessmentV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    disposition: z.enum(["accept", "review", "reject"]),
    pageCount: z.number().int().min(1).max(10),
    issues: z.array(preflightIssueSchema),
  })
  .strict()
  .superRefine((assessment, context) => {
    const hasRejectIssue = assessment.issues.some(
      (issue) => issue.severity === "reject",
    );
    const hasReviewIssue = assessment.issues.some(
      (issue) => issue.severity === "review",
    );

    if (assessment.disposition === "accept" && assessment.issues.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Accepted input cannot contain preflight issues",
        path: ["issues"],
      });
    }
    if (
      assessment.disposition === "review" &&
      (!hasReviewIssue || hasRejectIssue)
    ) {
      context.addIssue({
        code: "custom",
        message: "Review disposition requires review issues and no rejection",
        path: ["disposition"],
      });
    }
    if (assessment.disposition === "reject" && !hasRejectIssue) {
      context.addIssue({
        code: "custom",
        message: "Rejected input requires at least one rejection issue",
        path: ["disposition"],
      });
    }
  });

export type PreflightAssessmentV1 = z.infer<typeof preflightAssessmentV1Schema>;
export type PreflightIssueCode = z.infer<typeof preflightIssueCodeSchema>;
