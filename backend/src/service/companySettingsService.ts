import { companySettingsRepository } from "../repository/companySettingsRepository";
import type {
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
};
