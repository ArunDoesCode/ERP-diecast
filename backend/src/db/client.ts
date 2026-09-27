import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env";

// Prepared statements off: kept from the earlier pooled-connection setup so the
// app also works behind a transaction-mode pooler (e.g. PgBouncer).
const queryClient = postgres(env.DATABASE_URL, { prepare: false });

export const db = drizzle({ client: queryClient });

const getDatabaseHost = () => {
  try {
    return new URL(env.DATABASE_URL).hostname;
  } catch {
    return "invalid-database-url";
  }
};

let isConnected = false;

export const connectDb = async () => {
  if (isConnected) return;

  try {
    await queryClient`select 1`;
    isConnected = true;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOTFOUND"
    ) {
      throw new Error(
        `Database host could not be resolved: ${getDatabaseHost()}. Check DATABASE_URL host value and use URL-encoded password characters.`,
        { cause: error },
      );
    }

    throw error;
  }
};

export const disconnectDb = async () => {
  await queryClient.end({ timeout: 5 });
};
