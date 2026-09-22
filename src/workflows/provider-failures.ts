export interface SanitizedProviderFailure {
  code:
    | "provider_rate_limited"
    | "provider_unavailable"
    | "provider_timeout"
    | "provider_request_rejected"
    | "provider_response_invalid";
  retryable: boolean;
}

export function sanitizeProviderFailure(
  error: unknown,
): SanitizedProviderFailure {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : null;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  if (status === 429) return { code: "provider_rate_limited", retryable: true };
  if (status !== null && status >= 500) {
    return { code: "provider_unavailable", retryable: true };
  }
  if (["ETIMEDOUT", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT"].includes(code)) {
    return { code: "provider_timeout", retryable: true };
  }
  if (status !== null && status >= 400) {
    return { code: "provider_request_rejected", retryable: false };
  }
  return { code: "provider_response_invalid", retryable: false };
}
