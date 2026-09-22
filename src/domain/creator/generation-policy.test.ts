import { describe, expect, it, vi } from "vitest";

import {
  CostCeilingError,
  GenerationProviderError,
  MenuCostGuard,
  buildGenerationPlan,
  chunkForGeneration,
  withGenerationRetries,
} from "@/domain/creator/generation-policy";
import { createCreatorMenuFixture } from "@/providers/fixture/creator-menu-fixture";

describe("generation policy", () => {
  it("reuses only the confident source photo and generates eligible text-only items", () => {
    expect(buildGenerationPlan(createCreatorMenuFixture("en"))).toEqual([
      {
        itemId: "mackerel",
        disposition: "reuse_source_photo",
        sourcePhotoCandidateId: "photo-mackerel",
      },
      {
        itemId: "tea",
        disposition: "generate",
        sourcePhotoCandidateId: null,
      },
      {
        itemId: "udon",
        disposition: "generate",
        sourcePhotoCandidateId: null,
      },
    ]);
  });

  it("fans out in bounded groups of four", () => {
    expect(chunkForGeneration([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9],
    ]);
  });

  it("retries transient failures at most twice", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new GenerationProviderError("timeout", "timeout"))
      .mockRejectedValueOnce(
        new GenerationProviderError("provider_5xx", "provider_unavailable"),
      )
      .mockResolvedValue("ok");
    const sleep = vi.fn().mockResolvedValue(undefined);

    await expect(
      withGenerationRetries({ operation, sleep, random: () => 0 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry moderation, schema, or permanent provider failures", async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new GenerationProviderError("moderation", "blocked"));

    await expect(
      withGenerationRetries({ operation, sleep: vi.fn() }),
    ).rejects.toThrow("blocked");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("refuses a provider reservation that would exceed two dollars", () => {
    const guard = new MenuCostGuard();
    expect(guard.reserve(1.49).warning).toBe(false);
    expect(guard.reserve(0.01).warning).toBe(true);
    expect(() => guard.reserve(0.51)).toThrow(CostCeilingError);
  });
});
