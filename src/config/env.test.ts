import { describe, expect, it } from "vitest";
import { readCreatorEnvironment, readEnvironment } from "./env";

describe("readEnvironment", () => {
  it("accepts an optional valid public application URL", () => {
    expect(
      readEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "https://menugen.example",
      }),
    ).toEqual({
      NODE_ENV: "test",
      NEXT_PUBLIC_APP_URL: "https://menugen.example",
    });
  });

  it("rejects invalid public URLs", () => {
    expect(() =>
      readEnvironment({
        NODE_ENV: "test",
        NEXT_PUBLIC_APP_URL: "not-a-url",
      }),
    ).toThrow();
  });
});

describe("readCreatorEnvironment", () => {
  it("keeps the creator workflow off without external credentials", () => {
    expect(readCreatorEnvironment({})).toMatchObject({
      CREATOR_WORKFLOW_ENABLED: "false",
      CREATOR_BACKEND: "fixture",
      GENERATION_CONCURRENCY: 4,
      GENERATION_MAX_RETRIES: 2,
      GENERATION_COST_WARNING_USD: 1.5,
      GENERATION_COST_HARD_LIMIT_USD: 2,
    });
  });

  it("requires every managed-service credential before enabling the workflow", () => {
    expect(() =>
      readCreatorEnvironment({
        CREATOR_WORKFLOW_ENABLED: "true",
        CREATOR_BACKEND: "managed",
      }),
    ).toThrow();
  });

  it("does not allow the application hard ceiling above two dollars", () => {
    expect(() =>
      readCreatorEnvironment({ GENERATION_COST_HARD_LIMIT_USD: "2.01" }),
    ).toThrow();
  });
});
