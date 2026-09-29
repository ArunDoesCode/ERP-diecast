import type { db } from "../db/client";

/** A Drizzle transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either the shared client or a transaction; repositories take this so services can group writes. */
export type DbExecutor = typeof db | DbTransaction;
