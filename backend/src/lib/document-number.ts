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

// BR-SCO-09: financial-year sequence (Apr-Mar in IST), e.g. JWC/27-28/1.
// Consecutive per FY, never reused: the counter row is locked by the upsert
// until the caller's transaction ends, so a rolled-back challan gives its
// number back. periodKey = "<yy>-<yy+1>" of the FY that contains `date`.
export function financialYearOf(date: Date) {
  const ist = new Date(date.getTime() + 330 * 60_000);
  const year = ist.getUTCFullYear();
  const startYear = ist.getUTCMonth() >= 3 ? year : year - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(startYear)}-${two(startYear + 1)}`;
}

export async function allocateFinancialYearSequence(
  tx: Tx,
  docType: string,
  actorId: number,
  date: Date = new Date(),
): Promise<{ fy: string; seq: number }> {
  const fy = financialYearOf(date);
  const now = new Date();
  const [counterRow] = await tx
    .insert(documentNumberCounters)
    .values({
      docType,
      periodKey: fy,
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
  return { fy, seq: counterRow.lastSeq };
}
