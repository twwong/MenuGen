import { sleep } from "workflow";
import { RetryableError } from "workflow";

import { readCreatorEnvironment } from "@/config/env";
import { NeonLifecycleRepository } from "@/infrastructure/db/lifecycle-repository";
import { PrivateBlobStorage } from "@/providers/blob/private-blob-storage";

export async function sourceCleanupBackstopWorkflow(menuId: string) {
  "use workflow";
  await sleep("24h");
  await cleanupSourceAssetsStep(menuId);
}

export async function expireResultWorkflow(menuId: string, userId: string) {
  "use workflow";
  await sleep("30d");
  await deleteMenuAssetsStep(menuId, userId, "expiration");
  await sleep("90d");
  await pruneDeletionAuditsStep();
}

export async function deleteResultWorkflow(
  menuId: string,
  userId: string,
  reason: "user_request" | "expiration",
) {
  "use workflow";
  await deleteMenuAssetsStep(menuId, userId, reason);
  await sleep("90d");
  await pruneDeletionAuditsStep();
}

export async function cleanupSourceAssetsStep(menuId: string) {
  "use step";
  const environment = readCreatorEnvironment();
  const repository = new NeonLifecycleRepository();
  const keys = await repository.getSourceCleanupBatch(menuId);
  try {
    await new PrivateBlobStorage(
      required(environment.SOURCE_BLOB_READ_WRITE_TOKEN, "source_blob_missing"),
    ).delete(keys);
    await repository.recordSourceCleanup(menuId, new Date());
    return { deletedObjectCount: keys.length };
  } catch {
    throw new RetryableError("source_cleanup_failed", { retryAfter: "2s" });
  }
}

(
  cleanupSourceAssetsStep as typeof cleanupSourceAssetsStep & {
    maxRetries: number;
  }
).maxRetries = 2;

export async function deleteMenuAssetsStep(
  menuId: string,
  userId: string,
  reason: "user_request" | "expiration",
) {
  "use step";
  const environment = readCreatorEnvironment();
  const repository = new NeonLifecycleRepository();
  const batch = await repository.prepareDeletion({
    menuId,
    userId,
    reason,
    now: new Date(),
  });
  try {
    await new PrivateBlobStorage(
      required(environment.SOURCE_BLOB_READ_WRITE_TOKEN, "source_blob_missing"),
    ).delete(batch.sourceKeys);
    await new PrivateBlobStorage(
      required(environment.RESULT_BLOB_READ_WRITE_TOKEN, "result_blob_missing"),
    ).delete(batch.resultKeys);
    await repository.finalizeDeletion({ batch, reason, now: new Date() });
    return {
      sourceObjectCount: batch.sourceKeys.length,
      resultObjectCount: batch.resultKeys.length,
    };
  } catch {
    throw new RetryableError("asset_deletion_failed", { retryAfter: "2s" });
  }
}

(
  deleteMenuAssetsStep as typeof deleteMenuAssetsStep & {
    maxRetries: number;
  }
).maxRetries = 2;

export async function pruneDeletionAuditsStep() {
  "use step";
  return new NeonLifecycleRepository().pruneDeletionAudits(new Date());
}

function required(value: string | undefined, code: string) {
  if (!value) throw new Error(code);
  return value;
}
