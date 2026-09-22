import { z } from "zod";

import { getCreatorActor } from "@/app/create/session";
import { readCreatorEnvironment } from "@/config/env";
import { getOwnedResultAsset } from "@/infrastructure/db/asset-repository";
import { PrivateBlobStorage } from "@/providers/blob/private-blob-storage";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/creator/assets/[assetId]">,
) {
  if (readCreatorEnvironment().CREATOR_BACKEND !== "managed") {
    return Response.json({ code: "not_found" }, { status: 404 });
  }
  const { assetId: rawAssetId } = await context.params;
  const parsed = z.string().uuid().safeParse(rawAssetId);
  if (!parsed.success) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }
  const asset = await getOwnedResultAsset(parsed.data, await getCreatorActor());
  if (!asset) {
    return Response.json({ code: "not_found" }, { status: 404 });
  }
  const token = readCreatorEnvironment().RESULT_BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return Response.json({ code: "storage_unavailable" }, { status: 503 });
  }
  const stream = await new PrivateBlobStorage(token).read(asset.objectKey);
  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Length": String(asset.byteSize),
      "Content-Type": asset.mimeType,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
