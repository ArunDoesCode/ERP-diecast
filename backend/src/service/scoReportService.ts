import { scoReportRepository } from "../repository/scoReportRepository";
import type {
  lossLogQuerySchemaType,
  lossLogRowSchemaType,
  vendorStockQuerySchemaType,
  vendorStockRowSchemaType,
} from "../types/scoReport.types";

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

function meta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export const scoReportService = {
  async vendorStock(
    query: vendorStockQuerySchemaType,
  ): Promise<Paginated<vendorStockRowSchemaType>> {
    const { rows, total } = await scoReportRepository.vendorStock(query);
    return { data: rows, meta: meta(query.page, query.pageSize, total) };
  },

  async lossLog(
    query: lossLogQuerySchemaType,
  ): Promise<Paginated<lossLogRowSchemaType>> {
    const { rows, total } = await scoReportRepository.lossLog(query);
    return { data: rows, meta: meta(query.page, query.pageSize, total) };
  },
};
