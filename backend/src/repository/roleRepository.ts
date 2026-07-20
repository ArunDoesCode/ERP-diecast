import { and, asc, count, desc, eq } from "drizzle-orm";

import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import { employees } from "../db/schemas/03_hcm";

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
  async list(params: RoleListParams) {
    const sortColumn =
      params.sortBy && params.sortBy in roleSortColumns
        ? roleSortColumns[params.sortBy as keyof typeof roleSortColumns]
        : roles.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(roleColumns)
        .from(roles)
        .orderBy(orderFn(sortColumn), asc(roles.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(roles),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async findById(id: number) {
    const [row] = await db
      .select(roleColumns)
      .from(roles)
      .where(eq(roles.id, id))
      .limit(1);
    return row;
  },

  async create(name: string, createdBy: number) {
    const [row] = await db
      .insert(roles)
      .values({ name, isSystem: false, createdBy })
      .returning(roleColumns);
    return row;
  },

  async update(id: number, name: string) {
    const [row] = await db
      .update(roles)
      .set({ name })
      .where(eq(roles.id, id))
      .returning(roleColumns);
    return row;
  },

  async remove(id: number) {
    await db.delete(roles).where(eq(roles.id, id));
  },

  async countActiveEmployees(roleId: number) {
    const [row] = await db
      .select({ value: count() })
      .from(employees)
      .where(and(eq(employees.roleId, roleId), eq(employees.isActive, true)));
    return row?.value ?? 0;
  },
};
