import type { Actor } from "../lib/auth-middleware";
import { AppError } from "../lib/errors";
import type { HomeTileKey, homeCountsSchemaType } from "../types/home.types";

export const homeService = {
  // Contract stub (BR-FF-10..33, 85). Logic lands in the implement step.
  async getCounts(
    _actor: Actor,
    _actorId: number,
    _tiles: HomeTileKey[] | undefined,
  ): Promise<homeCountsSchemaType> {
    throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
  },
};
