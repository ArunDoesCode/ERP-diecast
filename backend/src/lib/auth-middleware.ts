import type { MiddlewareHandler } from "hono";
import { authRepository } from "../repository/authRepository";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions";
import { type Role, verifyAccessToken } from "./token";
import type { AppEnv } from "./types";

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

const ACTOR_CACHE_TTL_MS = 2000;
const actorCache = new Map<number, { actor: Actor; expiresAt: number }>();

export const loadActor: LoadActorFn = async (employeeId) => {
  const hit = actorCache.get(employeeId);
  if (hit && hit.expiresAt > Date.now()) return hit.actor;

  const row = await authRepository.getEmployeeRoleById(employeeId);
  if (!row) {
    actorCache.delete(employeeId);
    return null;
  }
  const isSuperAdmin = row.roleName === "super-admin";
  const permissions = new Set<PermissionKey>(
    isSuperAdmin
      ? PERMISSION_KEYS
      : ((await authRepository.getPermissionKeysByRoleId(
          row.roleId,
        )) as PermissionKey[]),
  );
  const actor: Actor = {
    id: row.id,
    name: row.name,
    roleId: row.roleId,
    roleName: row.roleName,
    isSuperAdmin,
    isActive: row.isActive,
    permissions,
  };
  actorCache.set(employeeId, {
    actor,
    expiresAt: Date.now() + ACTOR_CACHE_TTL_MS,
  });
  return actor;
};

export const invalidateActor: InvalidateActorFn = (employeeId) => {
  actorCache.delete(employeeId);
};

export const invalidateRole: InvalidateRoleFn = (roleId) => {
  for (const [id, entry] of actorCache) {
    if (entry.actor.roleId === roleId) actorCache.delete(id);
  }
};

/** Permission decision for service-layer checks (BR-AUTH-11); super-admin holds every key. */
export function can(actor: Actor, key: PermissionKey): boolean {
  return actor.isSuperAdmin || actor.permissions.has(key);
}

/**
 * Token check (401) then actor load (missing or inactive => 401, BR-AUTH-12).
 * Sets `user` and `actor` on the context; runs once per request.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("actor")) {
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

    const actor = await loadActor(Number(payload.userId));
    if (!actor || !actor.isActive) {
      throw new UnauthorizedError("Unauthorized");
    }

    c.set("user", payload);
    c.set("actor", actor);
  }
  await next();
};

/**
 * Allows the request only if the caller is super-admin or holds `key`.
 * Order (BR-AUTH-23): token check (401) -> load actor (inactive => 401,
 * BR-AUTH-12) -> permission check (403 PERMISSION_DENIED, body carries `key`).
 */
export function requirePermission(
  key: PermissionKey,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await requireAuth(c, async () => {});
    const actor = c.get("actor");
    if (!can(actor, key)) {
      throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
        key,
      });
    }
    await next();
  };
}

/** Legacy role-name guard, kept until the other branch stops using it. */
export function requireRole(...allowed: Role[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const role = c.get("actor")?.roleName as Role | undefined;
    if (!role || !allowed.includes(role)) {
      throw new ForbiddenError("Forbidden");
    }

    await next();
  };
}
