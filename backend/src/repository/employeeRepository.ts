import { asc, count, desc, eq, ilike } from "drizzle-orm";

import { db } from "../db/client";
import type { employeeSchemaType } from "../types/setup.types";
import { employees } from "../db/schemas/03_hcm";

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

type EmployeeWriteData = {
  name: string;
  phone?: string | undefined;
  dailyRatePaise?: number | undefined;
  roleId: number;
  email: string | null;
  passwordHash: string | null;
  qrToken: string | null;
  createdBy?: number | undefined;
};

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
    const whereClause = ilike(employees.name, `%${params.q}%`);

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(employeeColumns)
        .from(employees)
        .where(whereClause)
        .orderBy(asc(employees.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(employees).where(whereClause),
    ]);

    return { rows: rows.map(toEmployee), total: totalRow?.value ?? 0 };
  },

  async findById(id: number) {
    const [row] = await db
      .select(employeeColumns)
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    return row ? toEmployee(row) : undefined;
  },

  /** Internal lookup used only to determine current login method (password vs qr). */
  async findAuthStateById(id: number) {
    const [row] = await db
      .select({ id: employees.id, passwordHash: employees.passwordHash })
      .from(employees)
      .where(eq(employees.id, id))
      .limit(1);
    return row;
  },

  async create(data: EmployeeWriteData) {
    const [row] = await db
      .insert(employees)
      .values(data)
      .returning(employeeColumns);
    if (!row) {
      throw new Error("Failed to create employee");
    }
    return toEmployee(row);
  },

  async update(id: number, data: Partial<EmployeeWriteData>) {
    const [row] = await db
      .update(employees)
      .set({ ...data, lastUpdatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning(employeeColumns);
    return row ? toEmployee(row) : undefined;
  },

  async softDelete(id: number) {
    const [row] = await db
      .update(employees)
      .set({ isActive: false, lastUpdatedAt: new Date() })
      .where(eq(employees.id, id))
      .returning({ id: employees.id });
    return row;
  },
};
