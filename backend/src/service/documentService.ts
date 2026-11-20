import type { Actor } from "../lib/auth-middleware";
import { AppError } from "../lib/errors";
import type {
  panelParamSchemaType,
  panelSchemaType,
} from "../types/document.types";

export const documentService = {
  // Contract stub (BR-FF-42, 50..55). Access check runs before any lookup.
  async getPanel(
    _params: panelParamSchemaType,
    _actor: { actorId: number; actor: Actor },
  ): Promise<panelSchemaType> {
    throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
  },
};
