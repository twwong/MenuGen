import type { Readable } from "node:stream";

import type { PreflightAssessmentV1 } from "@/domain/creator/preflight";
import type { QuotaSummary } from "@/domain/creator/quota";
import type {
  MenuDraftV1,
  ReviewPatch,
  ReviewResolution,
} from "@/domain/creator/revisions";
import type { MenuState } from "@/domain/creator/state";
import type { TargetLanguage } from "@/domain/menu/menu-extraction";

export interface ActorContext {
  userId: string | null;
  anonymousToken: string | null;
}

export interface SafeMenuSummary {
  id: string;
  state: MenuState;
  targetLanguage: TargetLanguage;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
  issueCount: number;
  completedItemCount: number;
  totalItemCount: number;
}

export interface SafeMenuDetail extends SafeMenuSummary {
  currentRevision: MenuDraftV1 | null;
  generationRevisionId: string | null;
}

export interface CreatorRepository {
  createAnonymousMenu(input: {
    menuId: string;
    anonymousTokenHash: string;
    targetLanguage: TargetLanguage;
  }): Promise<SafeMenuSummary>;
  getOwnedMenu(
    menuId: string,
    actor: ActorContext,
  ): Promise<SafeMenuDetail | null>;
  listOwnedMenus(actor: ActorContext): Promise<readonly SafeMenuSummary[]>;
  claimAnonymousMenu(input: {
    menuId: string;
    anonymousTokenHash: string;
    userId: string;
  }): Promise<boolean>;
  saveInitialRevision(input: {
    menuId: string;
    actor: ActorContext;
    revision: MenuDraftV1;
  }): Promise<void>;
  appendRevision(input: {
    menuId: string;
    actor: ActorContext;
    previousRevisionId: string;
    patches: readonly ReviewPatch[];
    resolutions: readonly ReviewResolution[];
  }): Promise<MenuDraftV1>;
  transitionMenu(input: {
    menuId: string;
    actor: ActorContext;
    expectedState: MenuState;
    nextState: MenuState;
  }): Promise<boolean>;
  getQuotaSummary(userId: string, now: Date): Promise<QuotaSummary>;
}

export interface AuthGateway {
  getActor(): Promise<{ clerkUserId: string | null; email: string | null }>;
}

export interface StoredObject {
  key: string;
  mimeType: string;
  byteSize: number;
}

export interface ObjectStorage {
  put(input: {
    key: string;
    body: ReadableStream | Readable | Blob | ArrayBuffer;
    mimeType: string;
    byteSize: number;
  }): Promise<StoredObject>;
  read(key: string): Promise<ReadableStream>;
  delete(keys: readonly string[]): Promise<void>;
}

export interface ScannedUpload {
  menuId: string;
  assemblyId: string;
  files: ReadonlyArray<{
    sourceFileOrder: number;
    pageIndex: number;
    normalizedMimeType: "application/pdf" | "image/jpeg" | "image/png";
    byteSize: number;
    pageCount: number;
    malwareStatus: "clean";
    normalizedAssetRef: string;
  }>;
}

export interface UploadScanner {
  createSignedUpload(input: {
    menuId: string;
    sourceCount: number;
  }): Promise<{ uploadRequestId: string; params: string; signature: string }>;
  verifyCallback(payload: unknown): Promise<ScannedUpload>;
}

export interface PreflightProvider {
  assess(input: ScannedUpload): Promise<PreflightAssessmentV1>;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: string;
}

export interface RateLimiter {
  checkAnonymousExtraction(input: {
    ipAddress: string;
    deviceToken: string;
  }): Promise<{ ip: RateLimitResult; device: RateLimitResult }>;
}

export interface WorkflowStarter {
  startExtraction(menuId: string): Promise<{ runId: string }>;
  startGeneration(
    menuId: string,
    revisionId: string,
  ): Promise<{ runId: string }>;
  startSourceCleanup(menuId: string): Promise<{ runId: string }>;
  startResultExpiration(menuId: string): Promise<{ runId: string }>;
  startDeletion(
    menuId: string,
    reason: "expiration" | "user_request",
  ): Promise<{ runId: string }>;
}

export interface CompletionEmailSender {
  send(input: {
    email: string;
    menuId: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId: string }>;
}
