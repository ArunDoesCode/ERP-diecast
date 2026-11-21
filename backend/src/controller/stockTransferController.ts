import type { Context } from "hono";

import type { AppEnv } from "../lib/types";
import { notImplemented } from "./notImplemented";

// Contract step: every route answers 501 until the service lands.
export const stockTransferController = {
  list: (c: Context<AppEnv>) => notImplemented(c),
  details: (c: Context<AppEnv>) => notImplemented(c),
  create: (c: Context<AppEnv>) => notImplemented(c),
  update: (c: Context<AppEnv>) => notImplemented(c),
  cancel: (c: Context<AppEnv>) => notImplemented(c),
  post: (c: Context<AppEnv>) => notImplemented(c),
  reverse: (c: Context<AppEnv>) => notImplemented(c),
};
