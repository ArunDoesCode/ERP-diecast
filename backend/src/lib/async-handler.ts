import type { Context } from "hono";
import { isForeignKeyViolation, isUniqueViolation } from "./db-errors";

type AsyncRouteHandler<
  TContext extends Context = Context,
  TResult = unknown,
> = (c: TContext) => TResult | Promise<TResult>;

export function asyncHandler<TContext extends Context, TResult>(
  handler: AsyncRouteHandler<TContext, TResult>,
): AsyncRouteHandler<TContext, TResult> {
  return async (c: TContext) => {
    try {
      return await handler(c);
    } catch (error) {
      // BR-STD-34: a 23505 / 23503 is logged once by the error handler, without the driver detail.
      if (!isUniqueViolation(error) && !isForeignKeyViolation(error)) {
        console.error(`Route error: ${c.req.method} ${c.req.path}`, error);
      }
      throw error;
    }
  };
}
