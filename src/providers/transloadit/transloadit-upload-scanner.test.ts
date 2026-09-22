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
    const params = JSON.parse(signed.params) as {
      transcoding_result_expiry: string;
      steps: {
        normalized_images: { imagemagick_stack: string };
        pdf_pages: { imagemagick_stack: string };
      };
    };
    expect(params.transcoding_result_expiry).toBe("1day");
    expect(params.steps.normalized_images.imagemagick_stack).toBe("v3.0.1");
    expect(params.steps.pdf_pages.imagemagick_stack).toBe("v3.0.1");
  });

  it("restores PDF page order instead of trusting result order", async () => {
    const transloadit = JSON.stringify({
      assembly_id: "assembly-1",
      ok: "ASSEMBLY_COMPLETED",
      error: null,
      fields: { menuId: "78b51473-88d8-4c9a-9949-a279ad123876" },
      uploads: [{ id: "upload-a", mime: "application/pdf", size: 2_000 }],
      results: {
        normalized_images: [],
        pdf_pages: [
          {
            id: "result-a-2",
            original_id: "upload-a",
            url: "http://tmp.example/a-2.png",
            ssl_url: "https://tmp.example/a-2.png",
            mime: "image/png",
            size: 120,
            meta: { thumb_index: 1, page_count: 2 },
          },
          {
            id: "result-a-1",
            original_id: "upload-a",
            url: "http://tmp.example/a-1.png",
            ssl_url: "https://tmp.example/a-1.png",
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

    expect(result.menuId).toBe("78b51473-88d8-4c9a-9949-a279ad123876");
    expect(
      result.files.map((file) => [file.sourceFileOrder, file.pageIndex]),
    ).toEqual([
      [0, 0],
      [0, 1],
    ]);
    expect(result.files.map((file) => file.normalizedAssetRef)).toEqual([
      "https://tmp.example/a-1.png",
      "https://tmp.example/a-2.png",
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

  it("rejects mixed PDF and image uploads after signature verification", async () => {
    const transloadit = JSON.stringify({
      assembly_id: "assembly-mixed",
      ok: "ASSEMBLY_COMPLETED",
      error: null,
      fields: { menuId: "78b51473-88d8-4c9a-9949-a279ad123876" },
      uploads: [
        { id: "pdf", mime: "application/pdf", size: 100 },
        { id: "image", mime: "image/jpeg", size: 100 },
      ],
      results: {
        normalized_images: [
          {
            id: "image-result",
            original_id: "image",
            ssl_url: "https://tmp.transloadit.com/image.jpg",
            mime: "image/jpeg",
            size: 100,
          },
        ],
        pdf_pages: [
          {
            id: "pdf-result",
            original_id: "pdf",
            ssl_url: "https://tmp.transloadit.com/pdf.png",
            mime: "image/png",
            size: 100,
          },
        ],
      },
    });
    const signature = createHmac("sha1", "test-secret")
      .update(transloadit)
      .digest("hex");

    await expect(
      scanner.verifyCallback({ transloadit, signature }),
    ).rejects.toThrow("mixed_pdf_and_images");
  });

  it("enforces the 50 MB aggregate source limit", async () => {
    const transloadit = JSON.stringify({
      assembly_id: "assembly-large",
      ok: "ASSEMBLY_COMPLETED",
      error: null,
      fields: { menuId: "78b51473-88d8-4c9a-9949-a279ad123876" },
      uploads: [
        { id: "a", mime: "image/jpeg", size: 26 * 1024 * 1024 },
        { id: "b", mime: "image/jpeg", size: 26 * 1024 * 1024 },
      ],
      results: { normalized_images: [], pdf_pages: [] },
    });
    const signature = createHmac("sha1", "test-secret")
      .update(transloadit)
      .digest("hex");

    await expect(
      scanner.verifyCallback({ transloadit, signature }),
    ).rejects.toThrow("upload_total_size_limit");
  });
});
