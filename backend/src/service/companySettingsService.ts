import { ConflictError } from "../lib/errors";
import { companySettingsRepository } from "../repository/companySettingsRepository";
import type {
  companySettingsHistoryQuerySchemaType,
  companySettingsHistoryRowSchemaType,
  companySettingsSchemaType,
  companySettingsUpsertSchemaType,
} from "../types/sco.types";
import type {
  InvoiceTolerances,
  UpdateInvoiceTolerancesInput,
} from "../types/supplierInvoice.types";

// Percent with 2 decimals <-> basis points (0.5% = 50 bp).
const bpToPercent = (bp: number) => bp / 100;
const percentToBp = (percent: number) => Math.round(percent * 100);

// BR-SCO-09: plant details for the job-work challan; one row, owner edits.
export const companySettingsService = {
  async get(): Promise<companySettingsSchemaType | null> {
    return companySettingsRepository.get();
  },

  async upsert(
    input: companySettingsUpsertSchemaType,
    actorId: number,
  ): Promise<companySettingsSchemaType> {
    return companySettingsRepository.upsert(input, actorId);
  },

  // BR-SINV-32: defaults (price 0%, weight 0.5%) until the company row exists.
  async getInvoiceTolerances(): Promise<InvoiceTolerances> {
    const row = await companySettingsRepository.get();
    return {
      priceTolerancePercent: bpToPercent(row?.priceToleranceBp ?? 0),
      weightTolerancePercent: bpToPercent(row?.weightToleranceBp ?? 50),
    };
  },

  // BR-SINV-32: `company.manage` (route guard); a change applies to the next submit only.
  async updateInvoiceTolerances(
    input: UpdateInvoiceTolerancesInput,
    actorId: number,
  ): Promise<InvoiceTolerances> {
    const row = await companySettingsRepository.updateTolerances(
      {
        ...(input.priceTolerancePercent !== undefined
          ? { priceToleranceBp: percentToBp(input.priceTolerancePercent) }
          : {}),
        ...(input.weightTolerancePercent !== undefined
          ? { weightToleranceBp: percentToBp(input.weightTolerancePercent) }
          : {}),
      },
      actorId,
    );
    if (!row) {
      throw new ConflictError(
        "Save company details first",
        "SINV_COMPANY_NOT_SET",
      );
    }
    return {
      priceTolerancePercent: bpToPercent(row.priceToleranceBp),
      weightTolerancePercent: bpToPercent(row.weightToleranceBp),
    };
  },

  // BR-SCO-29: change history, newest first.
  async listHistory(query: companySettingsHistoryQuerySchemaType) {
    const { rows, total } = await companySettingsRepository.listHistory(
      query.page,
      query.pageSize,
    );
    return {
      data: rows as companySettingsHistoryRowSchemaType[],
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  },
};
