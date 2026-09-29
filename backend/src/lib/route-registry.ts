import type { ZodType } from "zod";
import type { PermissionKey } from "./permissions";
import type { Role } from "./token";

export type AuthRequirement =
  | { type: "public" }
  | { type: "any-authenticated" }
  | { type: "roles"; roles: Role[] } // legacy; removed once every router uses "permission"
  /** BR-AUTH-09/10: exactly one key; super-admin bypasses (BR-AUTH-18). */
  | {
      type: "permission";
      key: PermissionKey;
      /** Extra keys that also admit the caller (e.g. `.manage` admits a `.view` route). */
      alsoKeys?: PermissionKey[];
    };

export type RouteDescriptor = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  tags: string[];
  summary: string;
  auth: AuthRequirement;
  request?: {
    query?: ZodType;
    body?: ZodType;
    params?: ZodType;
  };
  responses: Record<string, ZodType>;
  pagination?: {
    sortableFields: string[];
    searchable: boolean;
  };
  notes?: string[];
};

const registry = new Map<string, RouteDescriptor>();

/**
 * Registers a route descriptor for the API contract manifest. Called once
 * per route, colocated directly below the route's `router.get/post/...`
 * definition. Throws if a descriptor for the same method+path is already
 * registered (catches copy-paste duplicates).
 */
export function register(descriptor: RouteDescriptor): void {
  const key = `${descriptor.method} ${descriptor.path}`;
  if (registry.has(key)) {
    throw new Error(`Route descriptor already registered for ${key}`);
  }
  registry.set(key, descriptor);
}

/** Returns all registered route descriptors, in registration order. */
export function getRegistry(): readonly RouteDescriptor[] {
  return Array.from(registry.values());
}
