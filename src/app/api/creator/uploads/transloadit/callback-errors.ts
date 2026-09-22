export function sanitizeUploadCallbackError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("signature")) return "invalid_signature";
  if (
    message.includes("limit") ||
    message.includes("invalid") ||
    message.includes("mismatch") ||
    message.includes("unmatched") ||
    message.includes("mixed")
  ) {
    return "invalid_upload";
  }
  return "callback_failed";
}
