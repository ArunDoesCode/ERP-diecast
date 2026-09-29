import type {
  scoChallanLines,
  scoChallans,
} from "../db/schemas/02_procurement-purchasing";
import { AppError } from "../lib/errors";

export type ChallanInsert = typeof scoChallans.$inferInsert;
export type ChallanRow = typeof scoChallans.$inferSelect;
export type ChallanLineInsert = typeof scoChallanLines.$inferInsert;
export type ChallanLineRow = typeof scoChallanLines.$inferSelect;

function notImplemented(): never {
  throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
}

// Stub (S2 contract step): queries land with the implementation.
export const scoChallanRepository = {
  async findById(_id: number): Promise<ChallanRow | null> {
    return notImplemented();
  },
  async listBySco(_scoId: number): Promise<ChallanRow[]> {
    return notImplemented();
  },
};
