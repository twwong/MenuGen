import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  UploadValidationError,
  validateUploadFiles,
} from "@/application/upload-validation";

describe("validateUploadFiles", () => {
  it("detects a spoofed filename and MIME type from the file signature", async () => {
    const image = await sharp({
      create: {
        width: 1_000,
        height: 1_000,
        channels: 3,
        background: "white",
      },
    })
      .png()
      .toBuffer();

    await expect(
      validateUploadFiles([
        {
          name: "menu.jpg",
          claimedMimeType: "image/jpeg",
          bytes: image,
          sourceFileOrder: 0,
        },
      ]),
    ).rejects.toMatchObject<Partial<UploadValidationError>>({
      code: "signature_mismatch",
    });
  });

  it("rejects encrypted PDFs before extraction", async () => {
    const encryptedMarker = new TextEncoder().encode(
      "%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n%%EOF",
    );

    await expect(
      validateUploadFiles([
        {
          name: "locked.pdf",
          claimedMimeType: "application/pdf",
          bytes: encryptedMarker,
          sourceFileOrder: 0,
        },
      ]),
    ).rejects.toMatchObject<Partial<UploadValidationError>>({
      code: "encrypted_pdf",
    });
  });

  it("accepts one readable PDF and records its page count", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();

    const result = await validateUploadFiles([
      {
        name: "menu.pdf",
        claimedMimeType: "application/pdf",
        bytes: await pdf.save(),
        sourceFileOrder: 0,
      },
    ]);

    expect(result[0]).toMatchObject({
      normalizedMimeType: "application/pdf",
      pageCount: 2,
    });
  });

  it("rejects an undersized photo with actionable guidance", async () => {
    const image = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: "white",
      },
    })
      .jpeg()
      .toBuffer();

    await expect(
      validateUploadFiles([
        {
          name: "small.jpg",
          claimedMimeType: "image/jpeg",
          bytes: image,
          sourceFileOrder: 0,
        },
      ]),
    ).rejects.toMatchObject<Partial<UploadValidationError>>({
      code: "image_dimensions",
    });
  });
});
