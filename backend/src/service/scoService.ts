import { NotImplementedError } from "../lib/errors";
import type {
  cancelScoSchemaType,
  createScoSchemaType,
  scoDetailsSchemaType,
  scoListQuerySchemaType,
  scoResponseSchemaType,
  updateScoSchemaType,
} from "../types/sco.types";

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

// Contract step (S1): signatures only, no business rules yet (BR-SCO-01..06, 20).
export const scoService = {
  async list(
    _query: scoListQuerySchemaType,
  ): Promise<Paginated<scoResponseSchemaType>> {
    throw new NotImplementedError();
  },

  async getDetails(_id: number): Promise<scoDetailsSchemaType> {
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

  async submit(_id: number, _actorId: number): Promise<scoDetailsSchemaType> {
    throw new NotImplementedError();
  },

  async cancel(
    _id: number,
    _input: cancelScoSchemaType,
    _actorId: number,
  ): Promise<scoDetailsSchemaType> {
    throw new NotImplementedError();
  },
};
