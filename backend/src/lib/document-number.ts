import { sql } from "drizzle-orm";

import type { db } from "../db/client";
import { documentNumberCounters } from "../db/schemas/01_auth";
import { AppError } from "./errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function allocateDocumentSequence(
  tx: Tx,
  docType: string,
  actorId: number,
  now: Date = new Date(),
) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const periodKey = `${year}-${month}`;

  const [counterRow] = await tx
    .insert(documentNumberCounters)
    .values({
      docType,
      periodKey,
      lastSeq: 1,
      createdBy: actorId,
      lastUpdatedBy: actorId,
      lastUpdatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        documentNumberCounters.docType,
        documentNumberCounters.periodKey,
      ],
      set: {
        lastSeq: sql`${documentNumberCounters.lastSeq} + 1`,
        lastUpdatedBy: actorId,
        lastUpdatedAt: now,
      },
    })
    .returning({ lastSeq: documentNumberCounters.lastSeq });

  if (!counterRow) {
    throw new AppError(
      `Failed to allocate ${docType} sequence`,
      500,
      "DOCUMENT_SEQUENCE_ALLOC_FAILED",
    );
  }

  return { periodKey, seq: counterRow.lastSeq };
}
