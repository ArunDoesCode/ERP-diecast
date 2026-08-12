import type { TokenPayload } from "./token";

export type AppEnv = {
  Variables: {
    user: TokenPayload;
  };
};

/**
 * Like `Partial<T>`, but keeps each property assignable from an explicit
 * `undefined` value (matches `exactOptionalPropertyTypes` when callers build
 * update payloads by stripping `undefined` keys from a Zod-inferred partial
 * object rather than by omitting the key entirely).
 */
export type PartialUpdate<T> = {
  [K in keyof T]?: T[K] | undefined;
};
