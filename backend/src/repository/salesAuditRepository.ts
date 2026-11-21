import { and, asc, count, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import { employees } from "../db/schemas/03_hcm";
import { salesAuditLog } from "../db/schemas/05_sales";
import type { DbExecutor } from "./executor";

export type SalesAuditEntry = {
  actorId: number;
  action: string;
  targetType: "customer" | "sale_order" | "explosion";
  targetId: number;
  soId?: number | null;
  before?: unknown;
  after?: unknown;
};

export const salesAuditRepository = {
  /** Insert-only (BR-SO-52). Always called with the caller's transaction. */
  async write(entry: SalesAuditEntry, executor: DbExecutor) {
    await executor.insert(salesAuditLog).values({
      actorId: entry.actorId,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      soId: entry.soId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  },

  async listForSo(
    soId: number,
    query: {
      page: number;
      pageSize: number;
      sortDir: "asc" | "desc";
      action?: string | undefined;
    },
  ) {
    const filters: SQL[] = [eq(salesAuditLog.soId, soId)];
    if (query.action) filters.push(eq(salesAuditLog.action, query.action));
    const where = and(...filters);
    const dir = query.sortDir === "asc" ? asc : desc;

    const [rows, totals] = await Promise.all([
      db
        .select({
          id: salesAuditLog.id,
          actorId: salesAuditLog.actorId,
          actorName: employees.name,
          action: salesAuditLog.action,
          targetType: salesAuditLog.targetType,
          targetId: salesAuditLog.targetId,
          before: salesAuditLog.before,
          after: salesAuditLog.after,
          at: salesAuditLog.at,
        })
        .from(salesAuditLog)
        .innerJoin(employees, eq(employees.id, salesAuditLog.actorId))
        .where(where)
        .orderBy(dir(salesAuditLog.at), dir(salesAuditLog.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(salesAuditLog).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },
};
