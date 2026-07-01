import type { Context } from "hono";
type AsyncRouteHandler<
  TContext extends Context = Context,
  TResult = unknown,
> = (c: TContext) => TResult | Promise<TResult>;

export function asyncHandler<TContext extends Context, TResult>(
  handler: AsyncRouteHandler<TContext, TResult>,
): AsyncRouteHandler<TContext, TResult> {
  return async (c: TContext) => {
    return await handler(c);
  };
}
