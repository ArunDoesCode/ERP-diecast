import type { Context } from "hono";
import type { AppEnv } from "../lib/types";

/** Contract-step stub: the route exists and is guarded, the logic comes later. */
export function notImplemented(c: Context<AppEnv>) {
  return c.json(
    { success: false, message: "Not implemented", code: "NOT_IMPLEMENTED" },
    501,
  );
}
