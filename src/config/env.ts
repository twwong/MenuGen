import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export function readEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return environmentSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    NEXT_PUBLIC_APP_URL: environment.NEXT_PUBLIC_APP_URL,
  });
}
