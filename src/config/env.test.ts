import { describe, expect, it } from "vitest";
import { readCreatorEnvironment, readEnvironment } from "./env";

const managedCredentials = {
  CREATOR_WORKFLOW_ENABLED: "true",
  CREATOR_BACKEND: "managed",
  DATABASE_URL: "postgresql://user:password@database.example/menugen",
  CLERK_SECRET_KEY: "clerk-secret",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "clerk-publishable",
  SOURCE_BLOB_READ_WRITE_TOKEN: "source-blob-token",
  RESULT_BLOB_READ_WRITE_TOKEN: "result-blob-token",
  TRANSLOADIT_KEY: "transloadit-key",
  TRANSLOADIT_SECRET: "transloadit-secret",
  RESEND_API_KEY: "resend-key",
  RESEND_FROM_EMAIL: "hello@menugen.example",
  OPENAI_API_KEY: "openai-key",
  DRAFT_COOKIE_SECRET: "x".repeat(32),
} as const;

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

  it("accepts Vercel Marketplace Upstash credentials", () => {
    expect(
      readCreatorEnvironment({
        ...managedCredentials,
        KV_REST_API_URL: "https://redis.example",
        KV_REST_API_TOKEN: "redis-token",
      }),
    ).toMatchObject({
      KV_REST_API_URL: "https://redis.example",
      KV_REST_API_TOKEN: "redis-token",
    });
  });

  it("keeps direct Upstash credential names backward compatible", () => {
    expect(
      readCreatorEnvironment({
        ...managedCredentials,
        UPSTASH_REDIS_REST_URL: "https://redis.example",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
      }),
    ).toMatchObject({
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
    });
  });

  it("does not allow the application hard ceiling above two dollars", () => {
    expect(() =>
      readCreatorEnvironment({ GENERATION_COST_HARD_LIMIT_USD: "2.01" }),
    ).toThrow();
  });
});
