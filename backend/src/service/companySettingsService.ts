import { companySettingsRepository } from "../repository/companySettingsRepository";
import type {
  companySettingsHistoryQuerySchemaType,
  companySettingsHistoryRowSchemaType,
  companySettingsSchemaType,
  companySettingsUpsertSchemaType,
} from "../types/sco.types";

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
