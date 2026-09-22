import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const creatorEnvironmentSchema = z
  .object({
    CREATOR_WORKFLOW_ENABLED: z.enum(["true", "false"]).default("false"),
    CREATOR_BACKEND: z.enum(["fixture", "managed"]).default("fixture"),
    DATABASE_URL: z.string().url().optional(),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
    SOURCE_BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    RESULT_BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    TRANSLOADIT_KEY: z.string().min(1).optional(),
    TRANSLOADIT_SECRET: z.string().min(1).optional(),
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    RESEND_FROM_EMAIL: z.string().email().optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    DRAFT_COOKIE_SECRET: z.string().min(32).optional(),
    EXTRACTION_MODEL: z.string().min(1).default("gpt-5.6-terra"),
    IMAGE_MODEL: z.string().min(1).default("gpt-image-2.5-flare-2026-09-08"),
    GENERATION_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(4),
    GENERATION_MAX_RETRIES: z.coerce.number().int().min(0).max(2).default(2),
    GENERATION_COST_WARNING_USD: z.coerce.number().positive().default(1.5),
    GENERATION_COST_HARD_LIMIT_USD: z.coerce
      .number()
      .positive()
      .max(2)
      .default(2),
  })
  .superRefine((environment, context) => {
    if (
      environment.CREATOR_WORKFLOW_ENABLED !== "true" ||
      environment.CREATOR_BACKEND !== "managed"
    )
      return;
    const requiredKeys = [
      "DATABASE_URL",
      "CLERK_SECRET_KEY",
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "SOURCE_BLOB_READ_WRITE_TOKEN",
      "RESULT_BLOB_READ_WRITE_TOKEN",
      "TRANSLOADIT_KEY",
      "TRANSLOADIT_SECRET",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "OPENAI_API_KEY",
      "DRAFT_COOKIE_SECRET",
    ] as const;
    for (const key of requiredKeys) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          message: `${key} is required when the creator workflow is enabled`,
          path: [key],
        });
      }
    }
    if (
      environment.GENERATION_COST_WARNING_USD >=
      environment.GENERATION_COST_HARD_LIMIT_USD
    ) {
      context.addIssue({
        code: "custom",
        message: "The cost warning must be lower than the hard limit",
        path: ["GENERATION_COST_WARNING_USD"],
      });
    }
  });

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return environmentSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    NEXT_PUBLIC_APP_URL: environment.NEXT_PUBLIC_APP_URL,
  });
}

export function readCreatorEnvironment(
  environment: Record<string, string | undefined> = process.env,
) {
  return creatorEnvironmentSchema.parse(environment);
}
