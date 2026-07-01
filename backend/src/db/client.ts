import { drizzle } from "drizzle-orm/postgres-js";

import { env } from "../lib/env";

// Supabase transaction pooler does not support prepared statements.
export const db = drizzle(env.DATABASE_URL);
