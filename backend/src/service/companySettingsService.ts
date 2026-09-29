import { NotImplementedError } from "../lib/errors";
import type {
  companySettingsSchemaType,
  companySettingsUpsertSchemaType,
} from "../types/sco.types";

// Contract step (S1): signatures only (BR-SCO-09).
export const companySettingsService = {
  async get(): Promise<companySettingsSchemaType | null> {
    throw new NotImplementedError();
  },

  async upsert(
    _input: companySettingsUpsertSchemaType,
    _actorId: number,
  ): Promise<companySettingsSchemaType> {
    throw new NotImplementedError();
  },
};
