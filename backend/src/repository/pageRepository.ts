import { asc, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "../db/client";
import { pages } from "../db/schemas/01_auth";

const pageColumns = {
  id: pages.id,
  key: pages.key,
  label: pages.label,
  path: pages.path,
  sortOrder: pages.sortOrder,
  moduleId: pages.moduleId,
};

type PageCreateData = {
  key: string;
  label: string;
  path: string;
  sortOrder?: number | undefined;
  moduleId: number | null;
  createdBy?: number | undefined;
};

type PageUpdateData = Omit<Partial<PageCreateData>, "key">;

type PageListParams = {
  page: number;
  pageSize: number;
  sortBy?: string | undefined;
  sortDir: "asc" | "desc";
};

const pageSortColumns = {
  label: pages.label,
  path: pages.path,
  moduleId: pages.moduleId,
  sortOrder: pages.sortOrder,
} as const;

export const pageRepository = {
  async list(params: PageListParams) {
    const sortColumn =
      params.sortBy && params.sortBy in pageSortColumns
        ? pageSortColumns[params.sortBy as keyof typeof pageSortColumns]
        : pages.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select(pageColumns)
        .from(pages)
        .orderBy(orderFn(sortColumn), asc(pages.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(pages),
    ]);

    return { rows, total: totalRow?.value ?? 0 };
  },

  async findById(id: number) {
    const [row] = await db
      .select(pageColumns)
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);
    return row;
  },

  async create(data: PageCreateData) {
    const [row] = await db.insert(pages).values(data).returning(pageColumns);
    return row;
  },

  async update(id: number, data: PageUpdateData) {
    const [row] = await db
      .update(pages)
      .set(data)
      .where(eq(pages.id, id))
      .returning(pageColumns);
    return row;
  },

  async remove(id: number) {
    await db.delete(pages).where(eq(pages.id, id));
  },

  /** Returns the subset of the given ids that actually exist. */
  async findExistingIds(ids: number[]) {
    const rows = await db
      .select({ id: pages.id })
      .from(pages)
      .where(inArray(pages.id, ids));
    return new Set(rows.map((row) => row.id));
  },
};
