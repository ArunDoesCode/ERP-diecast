import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { db } from "../db/client";
import { customers } from "../db/schemas/05_sales";
import { safeSearch } from "../lib/safe-search";
import type { CustomerListQuery } from "../types/customer.types";
import type { DbExecutor } from "./executor";

export type CustomerRow = typeof customers.$inferSelect;
export type CustomerInsert = typeof customers.$inferInsert;

const customerColumns = {
  id: customers.id,
  name: customers.name,
  stateCode: customers.stateCode,
  address: customers.address,
  gstin: customers.gstin,
  isActive: customers.isActive,
  createdAt: customers.createdAt,
  lastUpdatedAt: customers.lastUpdatedAt,
};

export const customerRepository = {
  async findById(id: number, executor: DbExecutor = db) {
    const [row] = await executor
      .select(customerColumns)
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);
    return row;
  },

  /** Locks the row so a concurrent edit of the same customer waits. */
  async findByIdForUpdate(id: number, executor: DbExecutor) {
    await executor.execute(
      sql`select ${customers.id} from ${customers} where ${customers.id} = ${id} for update`,
    );
    return this.findById(id, executor);
  },

  async insert(data: CustomerInsert, executor: DbExecutor = db) {
    const [row] = await executor
      .insert(customers)
      .values(data)
      .returning(customerColumns);
    return row;
  },

  async update(
    id: number,
    data: Partial<
      Pick<
        CustomerInsert,
        | "name"
        | "stateCode"
        | "address"
        | "gstin"
        | "isActive"
        | "lastUpdatedBy"
        | "lastUpdatedAt"
      >
    >,
    executor: DbExecutor = db,
  ) {
    const [row] = await executor
      .update(customers)
      .set(data)
      .where(eq(customers.id, id))
      .returning(customerColumns);
    return row;
  },

  async list(query: CustomerListQuery) {
    const filters: SQL[] = [];
    const search = safeSearch(query.q, customers.name);
    if (search) filters.push(search);
    if (query.isActive !== undefined)
      filters.push(eq(customers.isActive, query.isActive));
    if (query.stateCode) filters.push(eq(customers.stateCode, query.stateCode));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const dir = query.sortDir === "desc" ? desc : asc;
    const sortColumn =
      query.sortBy === "createdAt" ? customers.createdAt : customers.name;

    const [rows, totals] = await Promise.all([
      db
        .select(customerColumns)
        .from(customers)
        .where(where)
        .orderBy(dir(sortColumn), asc(customers.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      db.select({ total: count() }).from(customers).where(where),
    ]);
    return { rows, total: totals[0]?.total ?? 0 };
  },
};
