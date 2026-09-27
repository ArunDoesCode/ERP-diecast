/**
 * docs/specs/approval.md
 * BR-APR-08 — PATCH is partial: any field omitted from the body keeps its
 *   stored value. In particular an omitted `subDocType` must not reset to
 *   `any` (BL-022).
 * BR-APR-10 — A PATCH with no updatable field is 400; `minAmountPaise` and
 *   `maxAmountPaise` count as updatable fields.
 *
 * Real-DB test (test database, see bunfig.toml preload). Written by
 * test-writer from the spec only (redo of PR #4's coordinator-authored
 * version per .pipeline/bl018-bl022-tests/findings.md#F-01).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import { approvalPolicies } from "../db/schemas/02_procurement-approval";
import { employees } from "../db/schemas/03_hcm";
import { approvalRepository } from "../repository/approvalRepository";
import { approvalService } from "./approvalService";

const NAME_PREFIX = "TEST_bl022_update_policy_";

let ownerEmployeeId: number;
let policyId: number;

function requireId(row: { id: number } | undefined, what: string): number {
  if (!row) {
    throw new Error(`Fixture setup: insert into ${what} returned no row`);
  }
  return row.id;
}

beforeAll(async () => {
  const [ownerRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "owner"))
    .limit(1);
  if (!ownerRole) throw new Error("Fixture setup: role 'owner' does not exist");

  const [owner] = await db
    .insert(employees)
    .values({
      name: `${NAME_PREFIX}owner`,
      roleId: ownerRole.id,
      isActive: true,
    })
    .returning({ id: employees.id });
  ownerEmployeeId = requireId(owner, "employees (owner fixture)");

  const [policy] = await db
    .insert(approvalPolicies)
    .values({
      name: `${NAME_PREFIX}policy`,
      isActive: true,
      priority: 999997,
      docType: "pr",
      subDocType: "tooling",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
      createdBy: ownerEmployeeId,
      lastUpdatedBy: ownerEmployeeId,
    })
    .returning({ id: approvalPolicies.id });
  policyId = requireId(policy, "approval_policies (fixture)");
});

afterAll(async () => {
  await db.delete(approvalPolicies).where(eq(approvalPolicies.id, policyId));
  await db.delete(employees).where(eq(employees.id, ownerEmployeeId));
});

describe("approvalService.updatePolicy (BR-APR-08, BL-022)", () => {
  test("PATCH omitting subDocType leaves the stored subDocType unchanged", async () => {
    const updated = await approvalService.updatePolicy(
      policyId,
      { name: `${NAME_PREFIX}policy_renamed` },
      ownerEmployeeId,
    );

    expect(updated.name).toBe(`${NAME_PREFIX}policy_renamed`);
    expect(updated.subDocType).toBe("tooling");

    const stored = await approvalRepository.findPolicyById(policyId);
    expect(stored?.subDocType).toBe("tooling");
  });
});
