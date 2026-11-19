/**
 * #31 contract: the whole-number unit list the backend enforces (BR-GRN-02) equals the copy the
 * frontend uses for quantity steps. Written by test-writer from the spec only.
 */
import { expect, test } from "bun:test";
import path from "node:path";
import { WHOLE_NUMBER_UNITS } from "../../src/types/grn.types";

test("#31 frontend WHOLE_UOMS equals backend WHOLE_NUMBER_UNITS", async () => {
  // Dynamic import keeps the frontend file out of the backend tsc program.
  const file = path.resolve(
    import.meta.dir,
    "../../../frontend/src/lib/grn-units.ts",
  );
  const { WHOLE_UOMS } = (await import(file)) as { WHOLE_UOMS: string[] };
  expect([...WHOLE_UOMS].sort()).toEqual([...WHOLE_NUMBER_UNITS].sort());
});
