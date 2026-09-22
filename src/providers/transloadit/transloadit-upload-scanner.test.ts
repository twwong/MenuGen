import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { TransloaditUploadScanner } from "@/providers/transloadit/transloadit-upload-scanner";

const scanner = new TransloaditUploadScanner(
  "test-key",
  "test-secret",
  "https://example.test/api/uploads/transloadit",
);

describe("TransloaditUploadScanner", () => {
  it("signs short-lived upload instructions without exposing the secret", async () => {
    const signed = await scanner.createSignedUpload({
      menuId: "78b51473-88d8-4c9a-9949-a279ad123876",
      sourceCount: 2,
    });

    expect(signed.signature).toMatch(/^sha384:[a-f0-9]{96}$/);
    expect(signed.params).not.toContain("test-secret");
    expect(signed.params).toContain("/file/virusscan");
    expect(signed.params).toContain("/document/thumbs");
  });

  it("restores source and PDF page order instead of trusting result order", async () => {
    const transloadit = JSON.stringify({
      assembly_id: "assembly-1",
      ok: "ASSEMBLY_COMPLETED",
      error: null,
      fields: { menuId: "78b51473-88d8-4c9a-9949-a279ad123876" },
      uploads: [{ id: "upload-a" }, { id: "upload-b" }],
      results: {
        normalized_images: [
          {
            id: "result-b",
            original_id: "upload-b",
            url: "https://tmp.example/b.jpg",
            mime: "image/jpeg",
            size: 200,
            meta: {},
          },
        ],
        pdf_pages: [
          {
            id: "result-a-2",
            original_id: "upload-a",
            url: "https://tmp.example/a-2.png",
            mime: "image/png",
            size: 120,
            meta: { thumb_index: 1, page_count: 2 },
          },
          {
            id: "result-a-1",
            original_id: "upload-a",
            url: "https://tmp.example/a-1.png",
            mime: "image/png",
            size: 100,
            meta: { thumb_index: 0, page_count: 2 },
          },
        ],
      },
    });
    const signature = createHmac("sha1", "test-secret")
      .update(transloadit)
      .digest("hex");

    const result = await scanner.verifyCallback({ transloadit, signature });

    expect(
      result.files.map((file) => [file.sourceFileOrder, file.pageIndex]),
    ).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });

  it("rejects a callback before parsing when its signature is invalid", async () => {
    await expect(
      scanner.verifyCallback({
        transloadit: '{"malicious":"payload"}',
        signature: "0".repeat(40),
      }),
    ).rejects.toThrow("invalid_upload_callback_signature");
  });
});
