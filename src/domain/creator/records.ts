import { z } from "zod";

import { jobStateSchema } from "@/domain/creator/state";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });

export const assetKindSchema = z.enum([
  "source",
  "normalized_page",
  "source_photo_crop",
  "generated_image",
]);

export const assetRecordSchema = z
  .object({
    id: uuidSchema,
    menuId: uuidSchema,
    kind: assetKindSchema,
    mimeType: z.string().min(1),
    byteSize: z.number().int().nonnegative(),
    state: z.enum(["pending", "ready", "deleting", "deleted", "failed"]),
    expiresAt: timestampSchema.nullable(),
  })
  .strict();

export const jobRecordSchema = z
  .object({
    id: uuidSchema,
    menuId: uuidSchema,
    kind: z.enum([
      "preflight",
      "extraction",
      "generation",
      "source_cleanup",
      "result_expiration",
      "deletion",
    ]),
    state: jobStateSchema,
    workflowRunId: z.string().min(1).nullable(),
    sanitizedErrorCode: z.string().min(1).max(80).nullable(),
    attemptCount: z.number().int().nonnegative(),
  })
  .strict();

export const generationAttemptSchema = z
  .object({
    id: uuidSchema,
    menuId: uuidSchema,
    itemId: z.string().min(1),
    revisionId: uuidSchema,
    attemptNumber: z.number().int().positive(),
    requestedBy: z.enum(["initial", "uploader_regeneration"]),
    state: z.enum(["queued", "running", "succeeded", "failed"]),
    provider: z.string().min(1),
    model: z.string().min(1),
    templateVersion: z.string().min(1),
    promptHash: z.string().regex(/^[a-f0-9]{64}$/),
    moderationResult: z.enum(["allowed", "blocked", "error"]),
    estimatedCostUsd: z.number().nonnegative(),
    sanitizedErrorCode: z.string().min(1).max(80).nullable(),
  })
  .strict();

export const usageEventSchema = z
  .object({
    id: uuidSchema,
    menuId: uuidSchema,
    operation: z.enum(["moderation", "extraction", "translation", "image"]),
    provider: z.string().min(1),
    model: z.string().min(1),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    imageCount: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().nonnegative(),
    recordedAt: timestampSchema,
  })
  .strict();

export const deletionAuditSchema = z
  .object({
    id: uuidSchema,
    menuId: uuidSchema,
    reason: z.enum(["source_cleanup", "expiration", "user_request"]),
    assetKind: assetKindSchema,
    outcome: z.enum(["deleted", "already_absent", "failed"]),
    sanitizedErrorCode: z.string().min(1).max(80).nullable(),
    recordedAt: timestampSchema,
    retainUntil: timestampSchema,
  })
  .strict();

export type AssetRecord = z.infer<typeof assetRecordSchema>;
export type JobRecord = z.infer<typeof jobRecordSchema>;
export type GenerationAttempt = z.infer<typeof generationAttemptSchema>;
export type UsageEvent = z.infer<typeof usageEventSchema>;
export type DeletionAudit = z.infer<typeof deletionAuditSchema>;
