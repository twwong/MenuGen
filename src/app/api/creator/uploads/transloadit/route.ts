import { start } from "workflow/api";

import { validateUploadFiles } from "@/application/upload-validation";
import { readCreatorEnvironment } from "@/config/env";
import {
  NeonIngestionRepository,
  type StoredNormalizedPage,
} from "@/infrastructure/db/ingestion-repository";
import { PrivateBlobStorage } from "@/providers/blob/private-blob-storage";
import { TransloaditUploadScanner } from "@/providers/transloadit/transloadit-upload-scanner";
import { processMenuWorkflow } from "@/workflows/process-menu";

import { sanitizeUploadCallbackError } from "./callback-errors";

export async function POST(request: Request) {
  const environment = readCreatorEnvironment();
  if (
    environment.CREATOR_WORKFLOW_ENABLED !== "true" ||
    environment.CREATOR_BACKEND !== "managed"
  ) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }
  try {
    const form = await request.formData();
    const payload = {
      transloadit: form.get("transloadit"),
      signature: form.get("signature"),
    };
    const scanner = new TransloaditUploadScanner(
      required(environment.TRANSLOADIT_KEY, "transloadit_key_missing"),
      required(environment.TRANSLOADIT_SECRET, "transloadit_secret_missing"),
      new URL(
        "/api/creator/uploads/transloadit",
        required(process.env.NEXT_PUBLIC_APP_URL, "app_url_missing"),
      ).toString(),
    );
    const scanned = await scanner.verifyCallback(payload);
    const downloaded = await Promise.all(
      scanned.files.map(async (file, index) => ({
        file,
        bytes: await downloadNormalizedPage(file.normalizedAssetRef, index),
      })),
    );
    await validateUploadFiles(
      downloaded.map(({ file, bytes }, index) => ({
        name: `normalized-page-${index + 1}`,
        claimedMimeType: file.normalizedMimeType,
        bytes,
        sourceFileOrder: index,
      })),
    );

    const storage = new PrivateBlobStorage(
      required(environment.SOURCE_BLOB_READ_WRITE_TOKEN, "source_blob_missing"),
    );
    const storedPages: StoredNormalizedPage[] = [];
    for (const { file, bytes } of downloaded) {
      const extension = file.normalizedMimeType === "image/png" ? "png" : "jpg";
      const object = await storage.put({
        key: `menus/${scanned.menuId}/sources/${file.sourceFileOrder}-${file.pageIndex}.${extension}`,
        body: bytes.buffer as ArrayBuffer,
        mimeType: file.normalizedMimeType,
        byteSize: bytes.byteLength,
      });
      storedPages.push({
        ...object,
        sourceFileOrder: file.sourceFileOrder,
        pageIndex: file.pageIndex,
        pageCount: file.pageCount,
        assemblyId: scanned.assemblyId,
      });
    }

    const repository = new NeonIngestionRepository();
    await repository.persistNormalizedUpload({
      menuId: scanned.menuId,
      scanned,
      pages: storedPages,
      now: new Date(),
    });
    const claimedStart = await repository.claimExtractionWorkflowStart(
      scanned.menuId,
    );
    if (claimedStart) {
      try {
        const run = await start(processMenuWorkflow, [scanned.menuId]);
        await repository.recordExtractionRun(scanned.menuId, run.runId);
      } catch (error) {
        await repository.releaseExtractionWorkflowStart(scanned.menuId);
        throw error;
      }
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      { code: sanitizeUploadCallbackError(error) },
      { status: isInvalidCallback(error) ? 400 : 500 },
    );
  }
}

async function downloadNormalizedPage(ref: string, index: number) {
  const url = new URL(ref);
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "transloadit.com" ||
      url.hostname.endsWith(".transloadit.com")
    )
  ) {
    throw new Error("normalized_page_host_invalid");
  }
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok) throw new Error("normalized_page_download_failed");
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > 20 * 1024 * 1024) {
    throw new Error("normalized_page_size_limit");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > 20 * 1024 * 1024) {
    throw new Error(`normalized_page_${index}_size_invalid`);
  }
  return bytes;
}

function isInvalidCallback(error: unknown) {
  return sanitizeUploadCallbackError(error) !== "callback_failed";
}

function required(value: string | undefined, code: string) {
  if (!value) throw new Error(code);
  return value;
}
