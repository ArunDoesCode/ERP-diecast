import { NotImplementedError } from "../lib/errors";
import type {
  createScoSchemaType,
  scoDetailsSchemaType,
  scoListQuerySchemaType,
  scoResponseSchemaType,
  updateScoSchemaType,
} from "../types/sco.types";

// Contract step (S1): signatures only, no queries yet.
export const scoRepository = {
  async list(
    _params: scoListQuerySchemaType,
  ): Promise<{ rows: scoResponseSchemaType[]; total: number }> {
    throw new NotImplementedError();
  },

  async findDetails(_id: number): Promise<scoDetailsSchemaType | null> {
    throw new NotImplementedError();
  },

  async create(
    _input: createScoSchemaType,
    _actorId: number,
  ): Promise<scoDetailsSchemaType> {
    throw new NotImplementedError();
  },

  async update(
    _input: updateScoSchemaType,
    _actorId: number,
  ): Promise<scoDetailsSchemaType> {
    throw new NotImplementedError();
  },
};
