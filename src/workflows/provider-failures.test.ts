import { describe, expect, it } from "vitest";

import { sanitizeProviderFailure } from "@/workflows/provider-failures";

describe("sanitizeProviderFailure", () => {
  it.each([
    [{ status: 429 }, "provider_rate_limited"],
    [{ status: 503 }, "provider_unavailable"],
    [{ code: "ETIMEDOUT" }, "provider_timeout"],
  ] as const)("allows transient failures to retry", (error, code) => {
    expect(sanitizeProviderFailure(error)).toEqual({ code, retryable: true });
  });

  it.each([
    [{ status: 400 }, "provider_request_rejected"],
    [new Error("raw provider detail"), "provider_response_invalid"],
  ] as const)("keeps permanent failures terminal", (error, code) => {
    expect(sanitizeProviderFailure(error)).toEqual({ code, retryable: false });
  });
});
