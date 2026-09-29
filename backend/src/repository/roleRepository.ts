import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
} from "../db/schemas/02_procurement-approval";
import { employees } from "../db/schemas/03_hcm";
import type { DbExecutor } from "./executor";

const roleColumns = {
  id: roles.id,
  name: roles.name,
  isSystem: roles.isSystem,
};

type RoleListParams = {
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortDir: "asc" | "desc";
};

const roleSortColumns = {
  name: roles.name,
} as const;

export const roleRepository = {
  /** Paginated roles with key count and ACTIVE-employee count (BR-AUTH-07, 19). */
  async list(params: RoleListParams) {
    const sortColumn =
      params.sortBy && params.sortBy in roleSortColumns
        ? roleSortColumns[params.sortBy as keyof typeof roleSortColumns]
        : roles.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          ...roleColumns,
          keyCount:
            sql<number>`(select count(*) from role_permissions rp where rp.role_id = "roles"."id")`.mapWith(
              Number,
            ),
          employeeCount:
            sql<number>`(select count(*) from employees e where e.role_id = "roles"."id" and e.is_active = true)`.mapWith(
              Number,
            ),
        })
        .from(roles)
        .orderBy(orderFn(sortColumn), asc(roles.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(roles),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  /** Every role, unpaginated (assignable-roles reference list). */
  async listAll() {
    return db.select(roleColumns).from(roles).orderBy(asc(roles.id));
  },

  async findById(id: number, exec: DbExecutor = db) {
    const [row] = await exec
      .select(roleColumns)
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);
    return row;
  },

  async findByName(name: string, exec: DbExecutor = db) {
    const [row] = await exec
      .select(roleColumns)
      .from(roles)
      .where(eq(roles.name, name))
      .limit(1);
    return row;
  },

  async create(name: string, createdBy: number, exec: DbExecutor = db) {
    const [row] = await exec
      .insert(roles)
      .values({ name, isSystem: false, createdBy })
      .returning(roleColumns);
    return row;
  },

  async update(
    id: number,
    data: { name?: string | undefined },
    exec: DbExecutor = db,
  ) {
    const [row] = await exec
      .update(roles)
      .set(data)
      .where(eq(roles.id, id))
      .returning(roleColumns);
    return row;
  },

  async remove(id: number, exec: DbExecutor = db) {
    await exec.delete(roles).where(eq(roles.id, id));
  },

  async countActiveEmployees(roleId: number, exec: DbExecutor = db) {
    const [row] = await exec
      .select({ value: count() })
      .from(employees)
      .where(and(eq(employees.roleId, roleId), eq(employees.isActive, true)));
    return row?.value ?? 0;
  },

  async countInactiveEmployees(roleId: number, exec: DbExecutor = db) {
    const [row] = await exec
      .select({ value: count() })
      .from(employees)
      .where(and(eq(employees.roleId, roleId), eq(employees.isActive, false)));
    return row?.value ?? 0;
  },

  /**
   * True when any approval policy chain names this role, or an open approval
   * request is currently waiting on it (BR-AUTH-19). Chains store role NAMES.
   */
  async isUsedInApprovalChain(roleName: string, exec: DbExecutor = db) {
    const chainMatch = JSON.stringify([{ role: roleName }]);
    const [policy] = await exec
      .select({ id: approvalPolicies.id })
      .from(approvalPolicies)
      .where(sql`${approvalPolicies.approvalChain} @> ${chainMatch}::jsonb`)
      .limit(1);
    if (policy) return true;

    const [request] = await exec
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.status, "pending_approval"),
          eq(approvalRequests.currentApproverRole, roleName),
        ),
      )
      .limit(1);
    return Boolean(request);
  },
};
