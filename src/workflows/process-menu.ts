import { createHash } from "node:crypto";

import OpenAI from "openai";
import { FatalError, RetryableError } from "workflow";
import { start } from "workflow/api";

import { cropAllSourcePhotoCandidates } from "@/application/source-photo-crops";
import type { ScannedUpload } from "@/application/contracts";
import { readCreatorEnvironment } from "@/config/env";
import { targetLanguageSchema } from "@/domain/menu/menu-extraction";
import { NeonIngestionRepository } from "@/infrastructure/db/ingestion-repository";
import { runMenuPipeline } from "@/pipeline/menu-pipeline";
import { PrivateBlobStorage } from "@/providers/blob/private-blob-storage";
import { createManagedOpenAiProvider } from "@/providers/openai/create-openai-provider";
import { OpenAiPreflightProvider } from "@/providers/openai/openai-preflight-provider";
import {
  cleanupSourceAssetsStep,
  sourceCleanupBackstopWorkflow,
} from "@/workflows/lifecycle";
import { sanitizeProviderFailure } from "@/workflows/provider-failures";

export async function processMenuWorkflow(menuId: string) {
  "use workflow";

  await startSourceCleanupBackstopStep(menuId);
  try {
    const preflight = await preflightMenuStep(menuId);
    if (preflight !== "continue") {
      await cleanupSourceAssetsStep(menuId);
      return;
    }
    await extractMenuStep(menuId);
    await cropSourcePhotosStep(menuId);
    await cleanupSourceAssetsStep(menuId);
    await markReviewReadyStep(menuId);
  } catch {
    await markExtractionFailedStep(menuId, "menu_processing_failed");
    await cleanupSourceAssetsStep(menuId);
  }
}

export async function startSourceCleanupBackstopStep(menuId: string) {
  "use step";
  const run = await start(sourceCleanupBackstopWorkflow, [menuId]);
  await new NeonIngestionRepository().recordSourceCleanupRun(menuId, run.runId);
  return { runId: run.runId };
}

export async function preflightMenuStep(menuId: string) {
  "use step";
  const environment = readCreatorEnvironment();
  const repository = new NeonIngestionRepository();
  try {
    const input = await loadProviderInput(menuId);
    const provider = createManagedOpenAiProvider();
    const moderation = await provider.moderateInput(input.source);
    if (moderation.data.decision !== "allowed") {
      await repository.markExtractionFailed(
        menuId,
        "input_moderation_blocked",
        new Date(),
      );
      return "blocked" as const;
    }
    const preflight = await new OpenAiPreflightProvider(
      new OpenAI({
        apiKey: required(environment.OPENAI_API_KEY, "openai_missing"),
      }),
      environment.EXTRACTION_MODEL,
      { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 12 },
    ).assess(input.scanned);
    return repository.savePreflight({
      menuId,
      assessment: preflight.assessment,
      metadata: [moderation.metadata, preflight.metadata],
      now: new Date(),
    });
  } catch (error) {
    throwWorkflowFailure(error, "preflight_failed");
  }
}

(
  preflightMenuStep as typeof preflightMenuStep & { maxRetries: number }
).maxRetries = 2;

export async function extractMenuStep(menuId: string) {
  "use step";
  const repository = new NeonIngestionRepository();
  try {
    const input = await loadProviderInput(menuId);
    const target = await repository.getMenuTarget(menuId);
    const result = await runMenuPipeline({
      provider: createManagedOpenAiProvider(),
      input: input.source,
      targetLanguage: targetLanguageSchema.parse(target.targetLanguage),
      inputAlreadyModerated: true,
    });
    await repository.saveExtraction({
      menuId,
      menu: result.menu,
      metadata: result.stages,
      now: new Date(),
    });
    return {
      itemCount: result.menu.sections.reduce(
        (count, section) => count + section.items.length,
        0,
      ),
    };
  } catch (error) {
    throwWorkflowFailure(error, "extraction_failed");
  }
}

(
  extractMenuStep as typeof extractMenuStep & { maxRetries: number }
).maxRetries = 2;

export async function cropSourcePhotosStep(menuId: string) {
  "use step";
  const environment = readCreatorEnvironment();
  const repository = new NeonIngestionRepository();
  const sourceStorage = new PrivateBlobStorage(
    required(environment.SOURCE_BLOB_READ_WRITE_TOKEN, "source_blob_missing"),
  );
  const resultStorage = new PrivateBlobStorage(
    required(environment.RESULT_BLOB_READ_WRITE_TOKEN, "result_blob_missing"),
  );
  try {
    const pageRows = await repository.getNormalizedPages(menuId);
    const pages = await Promise.all(
      pageRows.map(async (page) => ({
        sourceFileOrder: requiredNumber(
          page.sourceFileOrder,
          "source_file_order_missing",
        ),
        pageIndex: requiredNumber(page.pageIndex, "page_index_missing"),
        bytes: new Uint8Array(
          await new Response(
            await sourceStorage.read(page.objectKey),
          ).arrayBuffer(),
        ),
      })),
    );
    const revision = await repository.getCurrentRevision(menuId);
    const crops = await cropAllSourcePhotoCandidates({
      pages,
      candidates: revision.menu.sourcePhotoCandidates,
    });
    for (const crop of crops) {
      const key = `menus/${menuId}/crops/${hashIdentifier(crop.candidateId)}.webp`;
      const object = await resultStorage.put({
        key,
        body: crop.bytes.buffer as ArrayBuffer,
        mimeType: crop.mimeType,
        byteSize: crop.bytes.byteLength,
      });
      await repository.saveSourcePhotoCrop({
        menuId,
        crop,
        object,
        now: new Date(),
      });
    }
    return { cropCount: crops.length };
  } catch (error) {
    throwWorkflowFailure(error, "source_photo_crop_failed");
  }
}

(
  cropSourcePhotosStep as typeof cropSourcePhotosStep & {
    maxRetries: number;
  }
).maxRetries = 2;

export async function markReviewReadyStep(menuId: string) {
  "use step";
  await new NeonIngestionRepository().markReviewReady(menuId, new Date());
}

export async function markExtractionFailedStep(menuId: string, code: string) {
  "use step";
  await new NeonIngestionRepository().markExtractionFailed(
    menuId,
    code,
    new Date(),
  );
}

async function loadProviderInput(menuId: string) {
  const environment = readCreatorEnvironment();
  const repository = new NeonIngestionRepository();
  const rows = await repository.getNormalizedPages(menuId);
  if (rows.length < 1 || rows.length > 10)
    throw new Error("page_count_invalid");
  const storage = new PrivateBlobStorage(
    required(environment.SOURCE_BLOB_READ_WRITE_TOKEN, "source_blob_missing"),
  );
  const files = await Promise.all(
    rows.map(async (row, index) => {
      const mimeType = normalizedMime(row.mimeType);
      const bytes = await new Response(
        await storage.read(row.objectKey),
      ).arrayBuffer();
      return {
        ref: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
        fileName: `page-${String(index + 1).padStart(2, "0")}.${mimeType === "image/png" ? "png" : "jpg"}`,
        mimeType,
        pageOrder: index,
        sourceFileOrder: requiredNumber(
          row.sourceFileOrder,
          "source_file_order_missing",
        ),
        pageIndex: requiredNumber(row.pageIndex, "page_index_missing"),
        byteSize: row.byteSize,
      };
    }),
  );
  return {
    source: {
      inputId: menuId,
      files: files.map((file) => ({
        ref: file.ref,
        fileName: file.fileName,
        mimeType: file.mimeType,
        pageOrder: file.pageOrder,
      })),
    },
    scanned: {
      menuId,
      assemblyId: "stored-normalized-pages",
      files: files.map((file) => ({
        sourceFileOrder: file.sourceFileOrder,
        pageIndex: file.pageIndex,
        normalizedMimeType: file.mimeType,
        byteSize: file.byteSize,
        pageCount: files.length,
        malwareStatus: "clean" as const,
        normalizedAssetRef: file.ref,
      })),
    } satisfies ScannedUpload,
  };
}

function normalizedMime(value: string): "image/jpeg" | "image/png" {
  if (value === "image/jpeg" || value === "image/png") return value;
  throw new Error("normalized_mime_invalid");
}

function required(value: string | undefined, code: string) {
  if (!value) throw new Error(code);
  return value;
}

function requiredNumber(value: number | null, code: string) {
  if (value === null) throw new Error(code);
  return value;
}

function hashIdentifier(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}

function throwWorkflowFailure(error: unknown, permanentCode: string): never {
  const failure = sanitizeProviderFailure(error);
  if (failure.retryable) {
    throw new RetryableError(failure.code, { retryAfter: "2s" });
  }
  throw new FatalError(permanentCode);
}
