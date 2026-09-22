import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { MenuDraftV1 } from "@/domain/creator/revisions";
import type { PreflightAssessmentV1 } from "@/domain/creator/preflight";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const menuStateEnum = pgEnum("menu_state", [
  "uploading",
  "preflight",
  "extracting",
  "review_ready",
  "generation_ready",
  "generating",
  "ready",
  "deleting",
  "deleted",
  "failed",
]);

export const itemStateEnum = pgEnum("item_state", [
  "pending",
  "source_photo_ready",
  "generation_eligible",
  "generating",
  "generated",
  "failed",
  "not_eligible",
]);

export const jobStateEnum = pgEnum("job_state", [
  "queued",
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
]);

export const assetStateEnum = pgEnum("asset_state", [
  "pending",
  "ready",
  "deleting",
  "deleted",
  "failed",
]);

export const assetKindEnum = pgEnum("asset_kind", [
  "source",
  "normalized_page",
  "source_photo_crop",
  "generated_image",
]);

export const quotaEntryKindEnum = pgEnum("quota_entry_kind", [
  "reservation",
  "consumption",
  "release",
  "adjustment",
]);

export const generationAttemptStateEnum = pgEnum("generation_attempt_state", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const generationRequestedByEnum = pgEnum("generation_requested_by", [
  "initial",
  "uploader_regeneration",
]);

export const moderationResultEnum = pgEnum("moderation_result", [
  "allowed",
  "blocked",
  "error",
]);

export const emailOutboxStateEnum = pgEnum("email_outbox_state", [
  "pending",
  "sending",
  "sent",
  "failed",
]);

export const creatorUsers = pgTable(
  "creator_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email"),
    ...timestamps,
  },
  (table) => [uniqueIndex("creator_users_clerk_id_uq").on(table.clerkUserId)],
);

export const menus = pgTable(
  "menus",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => creatorUsers.id),
    anonymousTokenHash: text("anonymous_token_hash"),
    targetLanguage: text("target_language").notNull(),
    state: menuStateEnum("state").default("uploading").notNull(),
    currentRevisionId: uuid("current_revision_id"),
    generationRevisionId: uuid("generation_revision_id"),
    extractionWorkflowRunId: text("extraction_workflow_run_id"),
    generationWorkflowRunId: text("generation_workflow_run_id"),
    sourceCleanupWorkflowRunId: text("source_cleanup_workflow_run_id"),
    resultExpirationWorkflowRunId: text("result_expiration_workflow_run_id"),
    sourceDeletionCompletedAt: timestamp("source_deletion_completed_at", {
      withTimezone: true,
    }),
    preflightAssessment: jsonb(
      "preflight_assessment",
    ).$type<PreflightAssessmentV1>(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 10,
      scale: 6,
    })
      .default("0")
      .notNull(),
    resultExpiresAt: timestamp("result_expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("menus_owner_user_idx").on(table.ownerUserId),
    index("menus_state_idx").on(table.state),
    index("menus_result_expiry_idx").on(table.resultExpiresAt),
    check(
      "menus_exactly_one_owner_check",
      sql`(${table.ownerUserId} is not null) <> (${table.anonymousTokenHash} is not null)`,
    ),
  ],
);

export const menuSources = pgTable(
  "menu_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    sourceFileOrder: integer("source_file_order").notNull(),
    originalFileName: text("original_file_name").notNull(),
    normalizedMimeType: text("normalized_mime_type"),
    byteSize: integer("byte_size").notNull(),
    pageCount: integer("page_count"),
    objectKey: text("object_key").notNull(),
    scannerAssemblyId: text("scanner_assembly_id"),
    malwareStatus: text("malware_status").default("pending").notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("menu_sources_order_uq").on(
      table.menuId,
      table.sourceFileOrder,
    ),
  ],
);

export const menuRevisions = pgTable(
  "menu_revisions",
  {
    id: uuid("id").primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    basedOnRevisionId: uuid("based_on_revision_id"),
    snapshot: jsonb("snapshot").$type<MenuDraftV1>().notNull(),
    createdByUserId: uuid("created_by_user_id").references(
      () => creatorUsers.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("menu_revisions_number_uq").on(
      table.menuId,
      table.revisionNumber,
    ),
  ],
);

export const menuItems = pgTable(
  "menu_items",
  {
    publicId: uuid("public_id").defaultRandom().notNull(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    state: itemStateEnum("state").default("pending").notNull(),
    activeAssetId: uuid("active_asset_id"),
    uploaderRegenerationCount: integer("uploader_regeneration_count")
      .default(0)
      .notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.menuId, table.itemId] }),
    uniqueIndex("menu_items_public_id_uq").on(table.publicId),
    index("menu_items_state_idx").on(table.menuId, table.state),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    itemId: text("item_id"),
    kind: assetKindEnum("kind").notNull(),
    state: assetStateEnum("state").default("pending").notNull(),
    objectKey: text("object_key").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sourceCandidateId: text("source_candidate_id"),
    sourceFileOrder: integer("source_file_order"),
    pageIndex: integer("page_index"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("assets_object_key_uq").on(table.objectKey),
    index("assets_menu_kind_idx").on(table.menuId, table.kind),
    index("assets_expiry_idx").on(table.expiresAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    businessKey: text("business_key").notNull(),
    state: jobStateEnum("state").default("queued").notNull(),
    workflowRunId: text("workflow_run_id"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    sanitizedErrorCode: text("sanitized_error_code"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("jobs_business_key_uq").on(table.businessKey),
    index("jobs_menu_state_idx").on(table.menuId, table.state),
  ],
);

export const generationAttempts = pgTable(
  "generation_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    revisionId: uuid("revision_id").notNull(),
    requestKey: text("request_key").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    regenerationSequence: integer("regeneration_sequence").default(0).notNull(),
    requestedBy: generationRequestedByEnum("requested_by").notNull(),
    state: generationAttemptStateEnum("state").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    templateVersion: text("template_version").notNull(),
    promptHash: text("prompt_hash").notNull(),
    moderationResult: moderationResultEnum("moderation_result").notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 10,
      scale: 6,
    }).notNull(),
    sanitizedErrorCode: text("sanitized_error_code"),
    providerRequestStartedAt: timestamp("provider_request_started_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("generation_attempts_request_key_uq").on(table.requestKey),
    index("generation_attempts_item_idx").on(table.menuId, table.itemId),
  ],
);

export const quotaLedger = pgTable(
  "quota_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => creatorUsers.id, { onDelete: "cascade" }),
    // Intentionally not a foreign key: deleting menu content must never erase
    // the append-only credit history and silently restore a consumed credit.
    menuId: uuid("menu_id").notNull(),
    reservationId: uuid("reservation_id").notNull(),
    kind: quotaEntryKindEnum("kind").notNull(),
    amount: integer("amount").notNull(),
    businessKey: text("business_key").notNull(),
    reasonCode: text("reason_code").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("quota_ledger_business_key_uq").on(table.businessKey),
    index("quota_ledger_user_time_idx").on(table.userId, table.occurredAt),
  ],
);

export const providerUsage = pgTable(
  "provider_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    imageCount: integer("image_count").default(0).notNull(),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 10,
      scale: 6,
    }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("provider_usage_menu_idx").on(table.menuId)],
);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventKey: text("event_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => creatorUsers.id, { onDelete: "cascade" }),
    menuId: uuid("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    state: emailOutboxStateEnum("state").default("pending").notNull(),
    resendId: text("resend_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sanitizedErrorCode: text("sanitized_error_code"),
    ...timestamps,
  },
  (table) => [uniqueIndex("email_outbox_event_key_uq").on(table.eventKey)],
);

export const deletionAudits = pgTable(
  "deletion_audits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    menuId: uuid("menu_id").notNull(),
    ownerUserId: uuid("owner_user_id"),
    businessKey: text("business_key").notNull(),
    reason: text("reason").notNull(),
    assetKind: assetKindEnum("asset_kind").notNull(),
    outcome: text("outcome").notNull(),
    sanitizedErrorCode: text("sanitized_error_code"),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retainUntil: timestamp("retain_until", { withTimezone: true }).notNull(),
    contentFree: boolean("content_free").default(true).notNull(),
  },
  (table) => [
    uniqueIndex("deletion_audits_business_key_uq").on(table.businessKey),
    index("deletion_audits_retention_idx").on(table.retainUntil),
  ],
);
