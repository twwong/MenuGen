import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/infrastructure/db/schema";

let database: ReturnType<typeof createDatabase> | undefined;

function createDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for persistent creator data");
  }

  return drizzle(neon(databaseUrl), { schema });
}

export function getDatabase() {
  database ??= createDatabase();
  return database;
}
