import sharp from "sharp";

import type { SourcePhotoCandidate } from "@/domain/menu/menu-extraction";
import { isConfidentUsableSourcePhoto } from "@/pipeline/menu-pipeline";

export interface NormalizedPage {
  sourceFileOrder: number;
  pageIndex: number;
  bytes: Uint8Array;
}

export interface SourcePhotoCrop {
  candidateId: string;
  associatedItemId: string | null;
  disposition: "automatic_reuse" | "review" | "unusable";
  mimeType: "image/webp";
  width: number;
  height: number;
  bytes: Uint8Array;
}

export async function cropAllSourcePhotoCandidates(input: {
  pages: readonly NormalizedPage[];
  candidates: readonly SourcePhotoCandidate[];
}): Promise<readonly SourcePhotoCrop[]> {
  const pages = new Map(
    input.pages.map((page) => [
      pageKey(page.sourceFileOrder, page.pageIndex),
      page,
    ]),
  );

  return Promise.all(
    input.candidates.map(async (candidate) => {
      const page = pages.get(
        pageKey(candidate.region.sourceFileOrder, candidate.region.pageIndex),
      );
      if (!page) throw new Error("source_photo_page_missing");
      const image = sharp(page.bytes, { failOn: "error" });
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error("source_photo_page_dimensions_missing");
      }
      const left = Math.floor(candidate.region.x * metadata.width);
      const top = Math.floor(candidate.region.y * metadata.height);
      const width = Math.min(
        metadata.width - left,
        Math.max(1, Math.ceil(candidate.region.width * metadata.width)),
      );
      const height = Math.min(
        metadata.height - top,
        Math.max(1, Math.ceil(candidate.region.height * metadata.height)),
      );
      const { data, info } = await image
        .extract({ left, top, width, height })
        .webp({ quality: 88 })
        .toBuffer({ resolveWithObject: true });

      return {
        candidateId: candidate.id,
        associatedItemId: candidate.association.itemId,
        disposition: cropDisposition(candidate),
        mimeType: "image/webp" as const,
        width: info.width,
        height: info.height,
        bytes: data,
      };
    }),
  );
}

export async function persistCropsBeforeSourceDeletion(input: {
  crops: readonly SourcePhotoCrop[];
  sourceObjectKeys: readonly string[];
  saveCrop: (crop: SourcePhotoCrop) => Promise<void>;
  deleteSources: (keys: readonly string[]) => Promise<void>;
  recordDeletion: (
    outcome: "deleted" | "already_absent" | "failed",
    sanitizedErrorCode: string | null,
  ) => Promise<void>;
}): Promise<void> {
  await Promise.all(input.crops.map(input.saveCrop));
  try {
    await input.deleteSources(input.sourceObjectKeys);
    await input.recordDeletion("deleted", null);
  } catch {
    await input.recordDeletion("failed", "source_delete_failed");
    throw new Error("source_delete_failed");
  }
}

function cropDisposition(
  candidate: SourcePhotoCandidate,
): SourcePhotoCrop["disposition"] {
  if (isConfidentUsableSourcePhoto(candidate)) return "automatic_reuse";
  if (candidate.usability.status === "unusable") return "unusable";
  return "review";
}

function pageKey(sourceFileOrder: number, pageIndex: number) {
  return `${sourceFileOrder}:${pageIndex}`;
}
