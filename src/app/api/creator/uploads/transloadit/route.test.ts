import { describe, expect, it } from "vitest";

import { sanitizeUploadCallbackError } from "@/app/api/creator/uploads/transloadit/callback-errors";

describe("upload callback error redaction", () => {
  it("returns an allowlisted code rather than a raw provider error", () => {
    const raw = new Error(
      "secret signed URL https://tmp.transloadit.com/private-token",
    );
    const code = sanitizeUploadCallbackError(raw);
    expect(code).toBe("callback_failed");
    expect(code).not.toContain("private-token");
  });

  it("keeps invalid signatures distinguishable without echoing them", () => {
    expect(
      sanitizeUploadCallbackError(
        new Error("invalid_upload_callback_signature deadbeef"),
      ),
    ).toBe("invalid_signature");
  });
});
