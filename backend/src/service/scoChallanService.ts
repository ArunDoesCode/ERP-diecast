import type { Actor } from "../lib/auth-middleware";
import { AppError } from "../lib/errors";
import type {
  challanDetailsSchemaType,
  challanPrintSchemaType,
  challanResponseSchemaType,
  createChallanSchemaType,
  openChallanListQuerySchemaType,
} from "../types/scoChallan.types";

type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

function notImplemented(): never {
  throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
}

// Stubs (S2 contract step). BR-SCO-07..11, 24, 25.
export const scoChallanService = {
  async create(
    _scoId: number,
    _input: createChallanSchemaType,
    _actorId: number,
    _actor: Actor,
  ): Promise<challanDetailsSchemaType> {
    return notImplemented();
  },

  async listBySco(_scoId: number): Promise<challanResponseSchemaType[]> {
    return notImplemented();
  },

  async listOpen(
    _query: openChallanListQuerySchemaType,
  ): Promise<Paginated<challanResponseSchemaType>> {
    return notImplemented();
  },

  async getPrintData(_challanId: number): Promise<challanPrintSchemaType> {
    return notImplemented();
  },
};
