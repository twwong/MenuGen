import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { ScannedUpload, UploadScanner } from "@/application/contracts";

const webhookInputSchema = z
  .object({
    transloadit: z.string().min(1),
    signature: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .strict();

const resultFileSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().url(),
    mime: z.string().min(1),
    size: z.number().int().nonnegative(),
    original_id: z.string().min(1).optional(),
    meta: z
      .object({
        page_count: z.number().int().positive().optional(),
        thumb_index: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const assemblySchema = z
  .object({
    assembly_id: z.string().min(1),
    ok: z.string().min(1),
    error: z.null(),
    fields: z
      .object({
        menuId: z.string().uuid(),
      })
      .passthrough(),
    uploads: z.array(
      z
        .object({
          id: z.string().min(1),
        })
        .passthrough(),
    ),
    results: z.record(z.string(), z.array(resultFileSchema)),
  })
  .passthrough();

export class TransloaditUploadScanner implements UploadScanner {
  constructor(
    private readonly authKey: string,
    private readonly authSecret: string,
    private readonly notifyUrl: string,
  ) {}

  async createSignedUpload(input: { menuId: string; sourceCount: number }) {
    if (input.sourceCount < 1 || input.sourceCount > 10) {
      throw new Error("invalid_source_count");
    }
    const uploadRequestId = randomUUID();
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const params = JSON.stringify({
      auth: {
        key: this.authKey,
        expires,
        nonce: uploadRequestId,
      },
      fields: {
        menuId: input.menuId,
        uploadRequestId,
      },
      notify_url: this.notifyUrl,
      max_num_files: input.sourceCount,
      assembly_status_expiry: "1day",
      steps: {
        ":original": { robot: "/upload/handle" },
        verified: {
          use: [":original"],
          robot: "/file/verify",
          allowed_mime_types: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/heic",
            "image/heif",
          ],
          error_on_decline: true,
        },
        within_limits: {
          use: ["verified"],
          robot: "/file/filter",
          declines: [["${file.size}", ">", "20mb"]],
          error_on_decline: true,
        },
        virus_scanned: {
          use: ["within_limits"],
          robot: "/file/virusscan",
          error_on_decline: true,
        },
        images_only: {
          use: ["virus_scanned"],
          robot: "/file/filter",
          accepts: [["${file.mime}", "regex", "^image/"]],
        },
        pdf_only: {
          use: ["virus_scanned"],
          robot: "/file/filter",
          accepts: [["${file.mime}", "=", "application/pdf"]],
        },
        normalized_images: {
          use: ["images_only"],
          robot: "/image/resize",
          result: true,
          format: "jpg",
          rotation: "auto",
          resize_strategy: "fit",
          width: 2400,
          height: 3200,
        },
        pdf_pages: {
          use: ["pdf_only"],
          robot: "/document/thumbs",
          result: true,
          format: "png",
          resize_strategy: "fit",
          width: 2400,
          height: 3200,
          page_range: "1-10",
        },
      },
    });
    const digest = createHmac("sha384", this.authSecret)
      .update(params)
      .digest("hex");
    return {
      uploadRequestId,
      params,
      signature: `sha384:${digest}`,
    };
  }

  async verifyCallback(payload: unknown): Promise<ScannedUpload> {
    const webhook = webhookInputSchema.parse(payload);
    const expected = createHmac("sha1", this.authSecret)
      .update(webhook.transloadit)
      .digest();
    const received = Buffer.from(webhook.signature, "hex");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new Error("invalid_upload_callback_signature");
    }

    const assembly = assemblySchema.parse(JSON.parse(webhook.transloadit));
    const normalized = [
      ...(assembly.results.normalized_images ?? []),
      ...(assembly.results.pdf_pages ?? []),
    ];
    if (normalized.length === 0 || normalized.length > 10) {
      throw new Error("invalid_normalized_page_count");
    }

    const uploadOrder = new Map(
      assembly.uploads.map((upload, index) => [upload.id, index]),
    );
    const pagesPerUpload = new Map<string, number>();
    for (const file of normalized) {
      if (!file.original_id || !uploadOrder.has(file.original_id)) {
        throw new Error("unmatched_normalized_upload");
      }
      pagesPerUpload.set(
        file.original_id,
        (pagesPerUpload.get(file.original_id) ?? 0) + 1,
      );
    }

    return {
      assemblyId: assembly.assembly_id,
      files: normalized
        .map((file) => ({
          sourceFileOrder: uploadOrder.get(file.original_id!)!,
          pageIndex: file.meta?.thumb_index ?? 0,
          normalizedMimeType:
            file.mime === "image/png"
              ? ("image/png" as const)
              : ("image/jpeg" as const),
          byteSize: file.size,
          pageCount:
            file.meta?.page_count ?? pagesPerUpload.get(file.original_id!) ?? 1,
          malwareStatus: "clean" as const,
          normalizedAssetRef: file.url,
        }))
        .sort(
          (left, right) =>
            left.sourceFileOrder - right.sourceFileOrder ||
            left.pageIndex - right.pageIndex,
        ),
    };
  }
}
