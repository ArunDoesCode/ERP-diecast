import { describe, expect, test } from "bun:test";
import { getRegistry } from "../../src/lib/route-registry";
import { mainRouter } from "../../src/routes/index";

/**
 * Drift-prevention test: every route Hono actually serves must have a
 * matching `registry.register(...)` descriptor, and vice versa. A new route
 * shipped without a descriptor (or a descriptor left behind after a route is
 * deleted/renamed) fails this test, not just code review discipline.
 */
describe("route registry drift check", () => {
  test("live Hono routes and registered descriptors are 1:1", () => {
    const liveRoutes = new Set(
      mainRouter.routes
        .filter((route) => route.method !== "ALL")
        .map((route) => `${route.method} /api${route.path}`),
    );

    const registeredRoutes = new Set(
      getRegistry().map(
        (descriptor) => `${descriptor.method} ${descriptor.path}`,
      ),
    );

    const missingFromRegistry = [...liveRoutes].filter(
      (route) => !registeredRoutes.has(route),
    );
    const missingFromLiveRoutes = [...registeredRoutes].filter(
      (route) => !liveRoutes.has(route),
    );

    expect({
      missingFromRegistry,
      missingFromLiveRoutes,
    }).toEqual({
      missingFromRegistry: [],
      missingFromLiveRoutes: [],
    });
  });
});
