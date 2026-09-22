import { describe, expect, it, vi } from "vitest";

import { OpenAiPreflightProvider } from "@/providers/openai/openai-preflight-provider";

const input = {
  menuId: "78b51473-88d8-4c9a-9949-a279ad123876",
  assemblyId: "assembly-1",
  files: [
    {
      sourceFileOrder: 0,
      pageIndex: 0,
      normalizedMimeType: "image/png" as const,
      byteSize: 100,
      pageCount: 1,
      malwareStatus: "clean" as const,
      normalizedAssetRef: "data:image/png;base64,AAAA",
    },
  ],
};

describe("OpenAiPreflightProvider", () => {
  it("uses high-detail structured output and treats page text as untrusted", async () => {
    const parse = vi.fn().mockResolvedValue({
      model: "gpt-5.6-terra",
      output_parsed: {
        schemaVersion: "1",
        disposition: "accept",
        pageCount: 1,
        issues: [],
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const provider = new OpenAiPreflightProvider(
      { responses: { parse } } as never,
      "gpt-5.6-terra",
      { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 12 },
      () => 10,
    );

    const result = await provider.assess(input);

    expect(result.assessment.disposition).toBe("accept");
    const request = parse.mock.calls[0]![0];
    expect(request.store).toBe(false);
    expect(request.instructions).toContain("untrusted data");
    expect(request.input[0].content[1]).toMatchObject({
      type: "input_image",
      detail: "high",
    });
    expect(result.metadata.operation).toBe("assess_preflight");
  });

  it("rejects a provider page count that does not match the normalized input", async () => {
    const provider = new OpenAiPreflightProvider(
      {
        responses: {
          parse: vi.fn().mockResolvedValue({
            model: "gpt-5.6-terra",
            output_parsed: {
              schemaVersion: "1",
              disposition: "accept",
              pageCount: 2,
              issues: [],
            },
            usage: { input_tokens: 100, output_tokens: 20 },
          }),
        },
      } as never,
      "gpt-5.6-terra",
      { inputUsdPerMillionTokens: 2, outputUsdPerMillionTokens: 12 },
    );

    await expect(provider.assess(input)).rejects.toThrow(
      "preflight_page_count_mismatch",
    );
  });
});
