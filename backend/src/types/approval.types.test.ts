/**
 * docs/specs/approval.md
 * BR-APR-08 — PATCH is partial: any field omitted from the body keeps its
 *   stored value. In particular an omitted `subDocType` must not reset to
 *   `any` (BL-022).
 * BR-APR-10 — A PATCH with no updatable field is 400; `minAmountPaise` and
 *   `maxAmountPaise` count as updatable fields.
 *
 * Written by test-writer from the spec only (redo of PR #4's coordinator-
 * authored version per .pipeline/bl018-bl022-tests/findings.md#F-01).
 */
import { describe, expect, test } from "bun:test";
import { updateApprovalPolicySchema } from "./approval.types";

describe("BR-APR-08 — updateApprovalPolicySchema keeps omitted fields unset", () => {
  test("omitting subDocType parses it as undefined, not 'any'", () => {
    const parsed = updateApprovalPolicySchema.parse({ name: "Renamed" });
    expect(parsed.subDocType).toBeUndefined();
    expect(parsed.subDocType).not.toBe("any");
  });

  test("an explicitly provided subDocType is preserved as given", () => {
    const parsed = updateApprovalPolicySchema.parse({ subDocType: "tooling" });
    expect(parsed.subDocType).toBe("tooling");
  });

  test("a body touching only name leaves every other field undefined", () => {
    const parsed = updateApprovalPolicySchema.parse({ name: "Renamed" });
    expect(parsed.description).toBeUndefined();
    expect(parsed.isActive).toBeUndefined();
    expect(parsed.priority).toBeUndefined();
    expect(parsed.subDocType).toBeUndefined();
    expect("isSaleOrderLinked" in parsed).toBe(false); // BR-APR-15
    expect(parsed.minAmountPaise).toBeUndefined();
    expect(parsed.maxAmountPaise).toBeUndefined();
    expect(parsed.autoApprove).toBeUndefined();
    expect(parsed.approvalChain).toBeUndefined();
  });
});

describe("BR-APR-10 — updateApprovalPolicySchema rejects an empty PATCH", () => {
  test("an empty body is rejected", () => {
    expect(updateApprovalPolicySchema.safeParse({}).success).toBe(false);
  });

  test("a body with only minAmountPaise is a valid, updatable PATCH", () => {
    const result = updateApprovalPolicySchema.safeParse({
      minAmountPaise: 5_000_000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.minAmountPaise).toBe(5_000_000);
      expect(result.data.subDocType).toBeUndefined();
    }
  });

  test("a body with only maxAmountPaise is a valid, updatable PATCH", () => {
    const result = updateApprovalPolicySchema.safeParse({
      maxAmountPaise: 10_000_000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxAmountPaise).toBe(10_000_000);
    }
  });

  test("a body containing only unrecognised keys is still rejected as empty", () => {
    // stripped by the schema's pick(), so this must behave like {}
    const result = updateApprovalPolicySchema.safeParse({
      notAField: "x",
    } as unknown as Record<string, unknown>);
    expect(result.success).toBe(false);
  });
});
