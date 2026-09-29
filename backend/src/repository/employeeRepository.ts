import { and, asc, count, desc, eq, ilike } from "drizzle-orm";

import { db } from "../db/client";
import { employees } from "../db/schemas/03_hcm";
import type { employeeSchemaType } from "../types/setup.types";
import type { DbExecutor } from "./executor";

const employeeColumns = {
  id: employees.id,
  name: employees.name,
  email: employees.email,
  phone: employees.phone,
  dailyRatePaise: employees.dailyRatePaise,
  roleId: employees.roleId,
  isActive: employees.isActive,
  createdAt: employees.createdAt,
  lastUpdatedAt: employees.lastUpdatedAt,
};

type EmployeeRow = Omit<employeeSchemaType, "qrToken">;

function toEmployee(row: EmployeeRow): employeeSchemaType {
  return { ...row, qrToken: null };
}

type EmployeeInsert = typeof employees.$inferInsert;

type EmployeeWriteData = Required<
  Pick<EmployeeInsert, "name" | "roleId" | "email" | "passwordHash" | "qrToken">
> &
  Pick<EmployeeInsert, "phone" | "dailyRatePaise" | "createdBy">;

type EmployeeListParams = {
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortDir: "asc" | "desc";
};

type EmployeeSearchParams = {
  q: string;
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortDir: "asc" | "desc";
};

const employeeSortColumns = {
  name: employees.name,
  roleId: employees.roleId,
  dailyRatePaise: employees.dailyRatePaise,
  isActive: employees.isActive,
} as const;

export const employeeRepository = {
  async list(params: EmployeeListParams) {
    const sortColumn =
      params.sortBy && params.sortBy in employeeSortColumns
        ? employeeSortColumns[params.sortBy as keyof typeof employeeSortColumns]
        : employees.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(employeeColumns)
        .from(employees)
        .orderBy(orderFn(sortColumn), asc(employees.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(employees),
    ]);

    return { rows: rows.map(toEmployee), total: totalRow?.value ?? 0 };
  },

  async search(params: EmployeeSearchParams) {
    const sortColumn =
      params.sortBy && params.sortBy in employeeSortColumns
        ? employeeSortColumns[params.sortBy as keyof typeof employeeSortColumns]
        : employees.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const whereClause = ilike(employees.name, `%${params.q}%`);

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(employeeColumns)
        .from(employees)
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(employees.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(employees).where(whereClause),
    ]);

    return { rows: rows.map(toEmployee), total: totalRow?.value ?? 0 };
  },

  async findById(id: number, exec: DbExecutor = db) {
    const [row] = await exec
      .select(employeeColumns)
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    return row ? toEmployee(row) : undefined;
  },

  /** Same as `findById` but takes a row lock; call inside a transaction. */
  async findByIdForUpdate(id: number, exec: DbExecutor) {
    const [row] = await exec
      .select(employeeColumns)
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1)
      .for("update");
    return row ? toEmployee(row) : undefined;
  },

  /**
   * Locks every ACTIVE employee holding the role, in id order (a fixed order so
   * two callers cannot deadlock). Used before the last-admin check (BR-AUTH-17).
   */
  async lockActiveByRole(roleId: number, exec: DbExecutor) {
    const rows = await exec
      .select({ id: employees.id })
      .from(employees)
      .where(and(eq(employees.roleId, roleId), eq(employees.isActive, true)))
      .orderBy(asc(employees.id))
      .for("update");
    return rows.map((r) => r.id);
  },

  /** Internal lookup used only to determine current login method (password vs qr). */
  async findAuthStateById(id: number, exec: DbExecutor = db) {
    const [row] = await exec
      .select({ id: employees.id, passwordHash: employees.passwordHash })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    return row;
  },

  async create(data: EmployeeWriteData, exec: DbExecutor = db) {
    const [row] = await exec
      .insert(employees)
      .values(data)
      .returning(employeeColumns);
    if (!row) {
      throw new Error("Failed to create employee");
    }
    return toEmployee(row);
  },

  async update(
    id: number,
    data: Partial<EmployeeWriteData>,
    exec: DbExecutor = db,
  ) {
    const [row] = await exec
      .update(employees)
      .set({ ...data, lastUpdatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning(employeeColumns);
    return row ? toEmployee(row) : undefined;
  },

  async softDelete(id: number, exec: DbExecutor = db) {
    const [row] = await exec
      .update(employees)
      .set({ isActive: false, lastUpdatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning({ id: employees.id });
    return row;
  },
};
