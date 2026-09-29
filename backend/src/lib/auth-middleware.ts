import type { MiddlewareHandler } from "hono";
import { ForbiddenError, UnauthorizedError } from "./errors";
import type { PermissionKey } from "./permissions";
import { type Role, verifyAccessToken } from "./token";
import type { AppEnv } from "./types";

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const authHeader = c.req.header("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token) {
    throw new UnauthorizedError("Unauthorized");
  }

  let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
  try {
    payload = await verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError("Invalid access token");
  }

  c.set("user", payload);
  await next();
};

export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!allowed.includes(user.role)) {
      throw new ForbiddenError("Forbidden");
    }

    await next();
  };
}

// ---------------------------------------------------------------------------
// S3 contract (auth-setup BR-AUTH-09, 12, 18, 23). Signatures only: nothing
// calls these yet and no router is switched. Implemented in the S3 build.
// ---------------------------------------------------------------------------

/**
 * The caller as read from the DB on every request (BR-AUTH-12), never from
 * the token. Cached briefly; the cache is cleared by `invalidateActor` /
 * `invalidateRole` on any change to the employee, role or its grants.
 */
export type Actor = {
  id: number;
  name: string;
  roleId: number;
  roleName: string;
  /** true when the role is the system super-admin role (BR-AUTH-18). */
  isSuperAdmin: boolean;
  isActive: boolean;
  permissions: Set<PermissionKey>;
};

/** Reads employee + role + grants fresh (or from the short cache). Returns null if the employee does not exist. */
export type LoadActorFn = (employeeId: number) => Promise<Actor | null>;
/** Drops one employee from the actor cache (role change, deactivation). */
export type InvalidateActorFn = (employeeId: number) => void;
/** Drops every cached actor holding this role (grant change, role delete). */
export type InvalidateRoleFn = (roleId: number) => void;

export const loadActor: LoadActorFn = async () => {
  throw new Error("not implemented (S3)");
};
export const invalidateActor: InvalidateActorFn = () => {
  throw new Error("not implemented (S3)");
};
export const invalidateRole: InvalidateRoleFn = () => {
  throw new Error("not implemented (S3)");
};

/**
 * Allows the request only if the caller is super-admin or holds `key`.
 * Order (BR-AUTH-23): token check (401) -> load actor (inactive => 401,
 * BR-AUTH-12) -> permission check (403 PERMISSION_DENIED, body carries `key`).
 * Sets `c.set("actor", actor)`. Replaces `requireRole` once routers switch.
 */
export function requirePermission(
  _key: PermissionKey,
): MiddlewareHandler<AppEnv> {
  return async () => {
    throw new Error("not implemented (S3)");
  };
}
