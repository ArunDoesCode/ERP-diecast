import type { MiddlewareHandler } from "hono";
import { authRepository } from "../repository/authRepository";
import { ForbiddenError, UnauthorizedError } from "./errors";
import { PERMISSION_KEYS, type PermissionKey } from "./permissions";
import { verifyAccessToken } from "./token";
import type { AppEnv } from "./types";

/**
 * The caller as read from the DB on every request (BR-AUTH-12), never from
 * the token. Cached briefly; the cache is cleared by `invalidateActor` /
 * `invalidateRole` on any change to the employee, role or its grants.
 */
export type Actor = {
  id: number;
  name: string;
  email: string | null;
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

/** The one system role that bypasses every permission check (BR-AUTH-18). */
export const SUPER_ADMIN_ROLE_NAME = "super-admin";
export const isSuperAdminRoleName = (roleName: string): boolean =>
  roleName === SUPER_ADMIN_ROLE_NAME;

const ACTOR_CACHE_TTL_MS = 2000;
const actorCache = new Map<number, { actor: Actor; expiresAt: number }>();
// #45: concurrent misses for one employee share one load (one query).
const inFlight = new Map<number, Promise<Actor | null>>();
// Bumped by every invalidation, so a load that started before a change never
// writes its stale result into the cache.
let cacheGeneration = 0;

async function readActor(employeeId: number): Promise<Actor | null> {
  const row = await authRepository.getActorRowById(employeeId);
  if (!row) return null;
  const isSuperAdmin = isSuperAdminRoleName(row.roleName);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roleId: row.roleId,
    roleName: row.roleName,
    isSuperAdmin,
    isActive: row.isActive,
    permissions: new Set<PermissionKey>(
      isSuperAdmin ? PERMISSION_KEYS : (row.keys as PermissionKey[]),
    ),
  };
}

export const loadActor: LoadActorFn = async (employeeId) => {
  const hit = actorCache.get(employeeId);
  if (hit && hit.expiresAt > Date.now()) return hit.actor;

  const pending = inFlight.get(employeeId);
  if (pending) return pending;

  const generation = cacheGeneration;
  const load = readActor(employeeId)
    .then((actor) => {
      if (generation === cacheGeneration) {
        if (actor) {
          actorCache.set(employeeId, {
            actor,
            expiresAt: Date.now() + ACTOR_CACHE_TTL_MS,
          });
        } else {
          actorCache.delete(employeeId);
        }
      }
      return actor;
    })
    .finally(() => {
      if (inFlight.get(employeeId) === load) inFlight.delete(employeeId);
    });
  inFlight.set(employeeId, load);
  return load;
};

export const invalidateActor: InvalidateActorFn = (employeeId) => {
  cacheGeneration += 1;
  actorCache.delete(employeeId);
  inFlight.delete(employeeId);
};

export const invalidateRole: InvalidateRoleFn = (roleId) => {
  cacheGeneration += 1;
  for (const [id, entry] of actorCache) {
    if (entry.actor.roleId === roleId) actorCache.delete(id);
  }
  // A load in flight may be for a holder of this role; let the next caller re-read.
  inFlight.clear();
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
    if (!actor?.isActive) {
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

/**
 * Like `requirePermission`, but holding any one of `keys` is enough
 * (e.g. approval.policy.manage also admits the .view routes, BR-APR-01).
 * The 403 body carries the first key, the one the route is documented with.
 */
export function requireAnyPermission(
  ...keys: [PermissionKey, ...PermissionKey[]]
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    await requireAuth(c, async () => {});
    const actor = c.get("actor");
    if (!keys.some((key) => can(actor, key))) {
      throw new ForbiddenError("Permission denied", "PERMISSION_DENIED", {
        key: keys[0],
      });
    }
    await next();
  };
}
