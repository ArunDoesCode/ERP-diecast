import type { Context } from "hono";
import type { AppEnv } from "../lib/types";
import { notImplemented } from "./notImplemented";

// Contract step: every handler is a 501 stub until the service lands.
export const purchaseReturnController = {
  list: (c: Context<AppEnv>) => notImplemented(c),
  awaiting: (c: Context<AppEnv>) => notImplemented(c),
  details: (c: Context<AppEnv>) => notImplemented(c),
  prefill: (c: Context<AppEnv>) => notImplemented(c),
  create: (c: Context<AppEnv>) => notImplemented(c),
  update: (c: Context<AppEnv>) => notImplemented(c),
  cancelDraft: (c: Context<AppEnv>) => notImplemented(c),
  post: (c: Context<AppEnv>) => notImplemented(c),
  cancel: (c: Context<AppEnv>) => notImplemented(c),
};
