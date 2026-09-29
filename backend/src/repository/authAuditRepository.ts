import { asc, count, desc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { authAuditLog } from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";
import type { DbExecutor } from "./executor";

type AuditInsert = {
  actorId: number;
  action: string;
  target: string;
  before?: unknown;
  after?: unknown;
};

type AuditListParams = {
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortDir: "asc" | "desc";
};

const auditSortColumns = {
  at: authAuditLog.at,
  action: authAuditLog.action,
  actorId: authAuditLog.actorId,
} as const;

/** Insert-only (BR-AUTH-20): there is deliberately no update or delete here. */
export const authAuditRepository = {
  async insert(exec: DbExecutor, row: AuditInsert) {
    await exec.insert(authAuditLog).values({
      actorId: row.actorId,
      action: row.action,
      target: row.target,
      before: row.before ?? null,
      after: row.after ?? null,
    });
  },

  async list(params: AuditListParams) {
    const sortColumn =
      params.sortBy && params.sortBy in auditSortColumns
        ? auditSortColumns[params.sortBy as keyof typeof auditSortColumns]
        : authAuditLog.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: authAuditLog.id,
          at: authAuditLog.at,
          actorId: authAuditLog.actorId,
          actorName: employees.name,
          action: authAuditLog.action,
          target: authAuditLog.target,
          before: authAuditLog.before,
          after: authAuditLog.after,
        })
        .from(authAuditLog)
        .leftJoin(employees, eq(employees.id, authAuditLog.actorId))
        .orderBy(orderFn(sortColumn), orderFn(authAuditLog.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(authAuditLog),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },
};
