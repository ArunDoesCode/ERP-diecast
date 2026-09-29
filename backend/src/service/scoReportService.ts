import { NotImplementedError } from "../lib/errors";
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

// S4 reports: contract stubs, logic lands in S4 implement.
export const scoReportService = {
  async vendorStock(
    _query: vendorStockQuerySchemaType,
  ): Promise<Paginated<vendorStockRowSchemaType>> {
    throw new NotImplementedError("Vendor stock report is not implemented yet");
  },

  async lossLog(
    _query: lossLogQuerySchemaType,
  ): Promise<Paginated<lossLogRowSchemaType>> {
    throw new NotImplementedError("Loss log is not implemented yet");
  },
};
