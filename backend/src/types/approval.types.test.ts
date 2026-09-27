import { describe, expect, test } from "bun:test";
import { updateApprovalPolicySchema } from "./approval.types";

/**
 * BL-022 regression: PATCH /approval/updatePolicy/:id is partial — omitted
 * fields must stay omitted so the service leaves them unchanged
 * (draft spec BR-APR-08 / BR-APR-10).
 */
describe("updateApprovalPolicySchema is partial (BL-022)", () => {
  test("omitting subDocType does not default it to 'any'", () => {
    const parsed = updateApprovalPolicySchema.parse({ name: "Renamed" });
    expect(parsed.subDocType).toBeUndefined();
  });

  test("an explicit subDocType is kept", () => {
    const parsed = updateApprovalPolicySchema.parse({ subDocType: "tooling" });
    expect(parsed.subDocType).toBe("tooling");
  });

  test("an amount-only PATCH is a valid update", () => {
    const parsed = updateApprovalPolicySchema.parse({
      minAmountPaise: 5000000,
    });
    expect(parsed.minAmountPaise).toBe(5000000);
    expect(parsed.subDocType).toBeUndefined();
  });

  test("an empty PATCH is still rejected", () => {
    expect(updateApprovalPolicySchema.safeParse({}).success).toBe(false);
  });
});
