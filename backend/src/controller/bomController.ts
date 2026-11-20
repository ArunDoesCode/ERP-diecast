import type { Context } from "hono";

import type { AppEnv } from "../lib/types";

// Contract step: every handler answers 501 until the slices that implement it land.
function notImplemented(c: Context<AppEnv>) {
  return c.json(
    { success: false, message: "Not implemented", code: "NOT_IMPLEMENTED" },
    501,
  );
}

export const bomController = {
  list: notImplemented,
  details: notImplemented,
  tree: notImplemented,
  changeSummary: notImplemented,
  needs: notImplemented,
  whereUsed: notImplemented,
  partHistory: notImplemented,
  create: notImplemented,
  update: notImplemented,
  remove: notImplemented,
  startRevision: notImplemented,
  release: notImplemented,
  retire: notImplemented,
};
