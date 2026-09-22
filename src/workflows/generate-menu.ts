import { createHash } from "node:crypto";

import { FatalError, RetryableError } from "workflow";
import { start } from "workflow/api";

import { readCreatorEnvironment } from "@/config/env";
import { chunkForGeneration } from "@/domain/creator/generation-policy";
import { NeonGenerationRepository } from "@/infrastructure/db/generation-repository";
import { NeonLifecycleRepository } from "@/infrastructure/db/lifecycle-repository";
import { PrivateBlobStorage } from "@/providers/blob/private-blob-storage";
import { createManagedOpenAiProvider } from "@/providers/openai/create-openai-provider";
import { ResendCompletionEmailSender } from "@/providers/resend/resend-completion-email";
import { expireResultWorkflow } from "@/workflows/lifecycle";
import { sanitizeProviderFailure } from "@/workflows/provider-failures";

export async function generateMenuWorkflow(menuId: string) {
  "use workflow";

  const active = await loadActiveGenerationStep(menuId);
  for (const group of chunkForGeneration(active.itemIds, active.concurrency)) {
    await Promise.all(
      group.map((itemId) =>
        generateItemStep(menuId, active.revisionId, itemId),
      ),
    );
  }
  const completed = await finalizeGenerationStep(menuId);
  if (!completed) throw new FatalError("generation_not_terminal");
  await sendCompletionEmailStep(menuId);
  await startExpirationWorkflowStep(menuId, active.ownerUserId);
}

export async function regenerateItemWorkflow(
  menuId: string,
  revisionId: string,
  itemId: string,
  regenerationSequence: number,
) {
  "use workflow";
  await generateItemStep(
    menuId,
    revisionId,
    itemId,
    "uploader_regeneration",
    regenerationSequence,
  );
  const completed = await finalizeGenerationStep(menuId);
  if (!completed) throw new FatalError("regeneration_not_terminal");
}

export async function completeSourcePhotoOnlyWorkflow(
  menuId: string,
  userId: string,
) {
  "use workflow";
  await sendCompletionEmailStep(menuId);
  await startExpirationWorkflowStep(menuId, userId);
  await completeSourcePhotoOnlyStep(menuId);
}

export async function loadActiveGenerationStep(menuId: string) {
  "use step";
  const [active, environment] = await Promise.all([
    new NeonGenerationRepository().getActiveGeneration(menuId),
    Promise.resolve(readCreatorEnvironment()),
  ]);
  return { ...active, concurrency: environment.GENERATION_CONCURRENCY };
}

export async function generateItemStep(
  menuId: string,
  revisionId: string,
  itemId: string,
  requestedBy: "initial" | "uploader_regeneration" = "initial",
  regenerationSequence = 0,
) {
  "use step";

  const environment = readCreatorEnvironment();
  const repository = new NeonGenerationRepository();
  let context;
  try {
    context = await repository.getDishImageContext({
      menuId,
      revisionId,
      itemId,
    });
  } catch {
    await repository.markItemFailedWithoutProvider({
      menuId,
      itemId,
      sanitizedErrorCode: "generation_context_invalid",
      now: new Date(),
    });
    return { itemId, disposition: "failed" as const };
  }
  const promptHash = createHash("sha256")
    .update(context.prompt, "utf8")
    .digest("hex");
  const started = await repository.beginProviderAttempt({
    menuId,
    itemId,
    revisionId,
    requestedBy,
    regenerationSequence,
    provider: "openai",
    model: environment.IMAGE_MODEL,
    templateVersion: "dish-image-v1",
    promptHash,
    reservedCostUsd: 0.15,
    hardLimitUsd: environment.GENERATION_COST_HARD_LIMIT_USD,
    now: new Date(),
  });
  if (started.disposition !== "call_provider" || !started.attemptId) {
    return { itemId, disposition: started.disposition };
  }

  try {
    const provider = createManagedOpenAiProvider();
    const generation = await provider.generateDishImage(context);
    const moderation = await provider.moderateImage(generation.data);
    if (moderation.data.decision !== "allowed") {
      await repository.recordProviderFailure({
        attemptId: started.attemptId,
        menuId,
        itemId,
        sanitizedErrorCode: "generated_image_blocked",
        permanent: true,
        now: new Date(),
      });
      return { itemId, disposition: "failed" as const };
    }

    const image = parseImageDataUrl(generation.data.assetRef);
    const storage = new PrivateBlobStorage(
      required(environment.RESULT_BLOB_READ_WRITE_TOKEN, "result_blob_missing"),
    );
    const object = await storage.put({
      key: `menus/${menuId}/items/${hashIdentifier(itemId)}/${started.requestKey}.webp`,
      body: image.bytes.buffer as ArrayBuffer,
      mimeType: image.mimeType,
      byteSize: image.bytes.byteLength,
    });
    await repository.recordProviderSuccess({
      attemptId: started.attemptId,
      menuId,
      itemId,
      objectKey: object.key,
      mimeType: object.mimeType,
      byteSize: object.byteSize,
      actualCostUsd: generation.metadata.estimatedCostUsd,
      provider: generation.metadata.provider,
      model: generation.metadata.model,
      inputTokens: generation.metadata.usage.inputTokens,
      outputTokens: generation.metadata.usage.outputTokens,
      now: new Date(),
    });
    return { itemId, disposition: "generated" as const };
  } catch (error) {
    const failure = sanitizeProviderFailure(error);
    const attemptNumber = Number(started.requestKey?.split(":").at(-1) ?? 1);
    const retryable = failure.retryable && attemptNumber < 3;
    await repository.recordProviderFailure({
      attemptId: started.attemptId,
      menuId,
      itemId,
      sanitizedErrorCode: failure.code,
      permanent: !retryable,
      now: new Date(),
    });
    if (retryable) {
      throw new RetryableError(failure.code, {
        retryAfter:
          500 * 2 ** (attemptNumber - 1) + Math.floor(Math.random() * 250),
      });
    }
    return { itemId, disposition: "failed" as const };
  }
}

(
  generateItemStep as typeof generateItemStep & { maxRetries: number }
).maxRetries = 2;

export async function finalizeGenerationStep(menuId: string) {
  "use step";
  return new NeonGenerationRepository().finalizeMenu(menuId, new Date());
}

export async function completeSourcePhotoOnlyStep(menuId: string) {
  "use step";
  await new NeonGenerationRepository().completeSourcePhotoOnly(
    menuId,
    new Date(),
  );
}

export async function sendCompletionEmailStep(menuId: string) {
  "use step";
  const environment = readCreatorEnvironment();
  const repository = new NeonLifecycleRepository();
  const event = await repository.claimCompletionEvent(menuId);
  if (!event) return { disposition: "already_sent" as const };
  try {
    const sender = new ResendCompletionEmailSender(
      required(environment.RESEND_API_KEY, "resend_missing"),
      required(environment.RESEND_FROM_EMAIL, "resend_sender_missing"),
      required(process.env.NEXT_PUBLIC_APP_URL, "app_url_missing"),
    );
    const sent = await sender.send({
      email: event.email,
      menuId: event.menuId,
      idempotencyKey: event.eventKey,
    });
    await repository.markCompletionEmailSent({
      eventKey: event.eventKey,
      providerMessageId: sent.providerMessageId,
      now: new Date(),
    });
    return { disposition: "sent" as const };
  } catch {
    await repository.markCompletionEmailFailed({
      eventKey: event.eventKey,
      sanitizedErrorCode: "completion_email_failed",
      retryable: true,
      now: new Date(),
    });
    throw new RetryableError("completion_email_failed", { retryAfter: "2s" });
  }
}

(
  sendCompletionEmailStep as typeof sendCompletionEmailStep & {
    maxRetries: number;
  }
).maxRetries = 2;

export async function startExpirationWorkflowStep(
  menuId: string,
  userId: string,
) {
  "use step";
  const run = await start(expireResultWorkflow, [menuId, userId]);
  await recordExpirationRun(menuId, run.runId);
  return { runId: run.runId };
}

async function recordExpirationRun(menuId: string, runId: string) {
  const { getDatabase } = await import("@/infrastructure/db/client");
  const { menus } = await import("@/infrastructure/db/schema");
  const { eq } = await import("drizzle-orm");
  await getDatabase()
    .update(menus)
    .set({ resultExpirationWorkflowRunId: runId, updatedAt: new Date() })
    .where(eq(menus.id, menuId));
}

function parseImageDataUrl(value: string) {
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match?.[1] || !match[2]) throw new Error("generated_image_invalid");
  return {
    mimeType: match[1],
    bytes: new Uint8Array(Buffer.from(match[2], "base64")),
  };
}

function required(value: string | undefined, code: string) {
  if (!value) throw new Error(code);
  return value;
}

function hashIdentifier(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 24);
}
