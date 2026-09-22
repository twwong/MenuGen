import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  cropAllSourcePhotoCandidates,
  persistCropsBeforeSourceDeletion,
} from "@/application/source-photo-crops";
import type { SourcePhotoCandidate } from "@/domain/menu/menu-extraction";

const candidates: SourcePhotoCandidate[] = [
  {
    id: "clear",
    region: {
      sourceFileOrder: 0,
      pageIndex: 0,
      x: 0.1,
      y: 0.1,
      width: 0.4,
      height: 0.4,
      confidence: 0.99,
      needsReview: false,
    },
    association: {
      itemId: "dish-a",
      confidence: 0.98,
      needsReview: false,
    },
    usability: {
      status: "usable",
      confidence: 0.94,
      needsReview: false,
    },
  },
  {
    id: "ambiguous",
    region: {
      sourceFileOrder: 0,
      pageIndex: 0,
      x: 0.55,
      y: 0.1,
      width: 0.35,
      height: 0.4,
      confidence: 0.95,
      needsReview: false,
    },
    association: {
      itemId: null,
      confidence: 0.5,
      needsReview: true,
    },
    usability: {
      status: "uncertain",
      confidence: 0.7,
      needsReview: true,
    },
  },
];

describe("source photo crops", () => {
  it("crops every candidate but only marks confident usable evidence for reuse", async () => {
    const page = await sharp({
      create: {
        width: 1_000,
        height: 800,
        channels: 3,
        background: "#d7b98e",
      },
    })
      .png()
      .toBuffer();

    const crops = await cropAllSourcePhotoCandidates({
      pages: [{ sourceFileOrder: 0, pageIndex: 0, bytes: page }],
      candidates,
    });

    expect(crops).toHaveLength(2);
    expect(crops.map((crop) => crop.disposition)).toEqual([
      "automatic_reuse",
      "review",
    ]);
    expect(crops[0]).toMatchObject({ width: 400, height: 320 });
  });

  it("deletes sources only after every crop is durable", async () => {
    const calls: string[] = [];
    const crop = {
      candidateId: "clear",
      associatedItemId: "dish-a",
      disposition: "automatic_reuse" as const,
      mimeType: "image/webp" as const,
      width: 400,
      height: 320,
      bytes: new Uint8Array([1]),
    };
    await persistCropsBeforeSourceDeletion({
      crops: [crop, { ...crop, candidateId: "second" }],
      sourceObjectKeys: ["source-a"],
      saveCrop: async () => {
        calls.push("crop");
      },
      deleteSources: async () => {
        calls.push("delete");
      },
      recordDeletion: async () => {
        calls.push("audit");
      },
    });

    expect(calls).toEqual(["crop", "crop", "delete", "audit"]);
  });

  it("keeps sources when a candidate crop fails to persist", async () => {
    const deleteSources = vi.fn();
    await expect(
      persistCropsBeforeSourceDeletion({
        crops: [
          {
            candidateId: "clear",
            associatedItemId: "dish-a",
            disposition: "automatic_reuse",
            mimeType: "image/webp",
            width: 400,
            height: 320,
            bytes: new Uint8Array([1]),
          },
        ],
        sourceObjectKeys: ["source-a"],
        saveCrop: async () => {
          throw new Error("storage_unavailable");
        },
        deleteSources,
        recordDeletion: vi.fn(),
      }),
    ).rejects.toThrow("storage_unavailable");
    expect(deleteSources).not.toHaveBeenCalled();
  });
});
