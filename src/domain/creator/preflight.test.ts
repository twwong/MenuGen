import { describe, expect, it } from "vitest";

import { preflightAssessmentV1Schema } from "@/domain/creator/preflight";

describe("preflightAssessmentV1Schema", () => {
  it("accepts content-free recapture guidance for a rejected page", () => {
    const result = preflightAssessmentV1Schema.parse({
      schemaVersion: "1",
      disposition: "reject",
      pageCount: 1,
      issues: [
        {
          code: "blur",
          severity: "reject",
          sourceFileOrder: 0,
          pageIndex: 0,
          confidence: 0.98,
          guidance:
            "Retake the page in brighter light and hold the camera steady.",
        },
      ],
    });

    expect(result.disposition).toBe("reject");
  });

  it("rejects an accept disposition that contains issues", () => {
    expect(() =>
      preflightAssessmentV1Schema.parse({
        schemaVersion: "1",
        disposition: "accept",
        pageCount: 1,
        issues: [
          {
            code: "glare",
            severity: "review",
            sourceFileOrder: 0,
            pageIndex: 0,
            confidence: 0.6,
            guidance: "Move away from direct light.",
          },
        ],
      }),
    ).toThrow();
  });
});
