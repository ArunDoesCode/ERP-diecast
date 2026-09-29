/**
 * Integration tests for the approval policy engine — the first real-DB test
 * pattern in this repo. Requires `docker compose up -d` running locally
 * (same Postgres `bun run dev` already assumes) and the schema pushed via
 * `bun run db:push`.
 *
 * Regression-covers the findMatchingActivePolicy bug fix (undefined
 * `prTypeFilter` reference, wrong subDocType null-check) and the
 * specificity-tier ranking added in place of pure priority ordering.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { rolePermissions, roles } from "../db/schemas/01_auth";
import {
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import { purchaseRequests } from "../db/schemas/02_procurement-purchasing";
import { employees } from "../db/schemas/03_hcm";
import { loadActor } from "../lib/auth-middleware";
import { approvalService } from "../service/approvalService";
import { approvalRepository } from "./approvalRepository";

const NAME_PREFIX = "TEST_approval_engine_";

let ownerEmployeeId: number;
let plainRoleId: number;
let requestorEmployeeId: number;
let tierFixturePolicyId: number;
let toolingPrPolicyId: number;
let toolingPrId: number;
let createdRequestId: number | undefined;

async function roleId(name: string) {
  const [row] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name))
    .limit(1);
  if (!row) {
    throw new Error(`Fixture setup: role '${name}' does not exist`);
  }
  return row.id;
}

function requireId(row: { id: number } | undefined, what: string): number {
  if (!row) {
    throw new Error(`Fixture setup: insert into ${what} returned no row`);
  }
  return row.id;
}

beforeAll(async () => {
  const ownerRoleId = await roleId("owner");

  const [owner] = await db
    .insert(employees)
    .values({
      name: `${NAME_PREFIX}owner`,
      roleId: ownerRoleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  ownerEmployeeId = requireId(owner, "employees (owner fixture)");

  // BR-APR-61: an owner's own request is auto-approved, so the requester holds a
  // role without approval.auto_approve_own and gets the pending Owner step.
  const [plainRole] = await db
    .insert(roles)
    .values({ name: `${NAME_PREFIX}plain_role`, isSystem: false })
    .returning({ id: roles.id });
  plainRoleId = requireId(plainRole, "roles (plain fixture)");
  // BR-APR-24: submitting a PR also needs the document type's key. Removed with
  // the role on cleanup (role_permissions cascades).
  await db
    .insert(rolePermissions)
    .values({ roleId: plainRoleId, permissionKey: "pr.manage" });

  const [requestor] = await db
    .insert(employees)
    .values({
      name: `${NAME_PREFIX}requestor`,
      roleId: plainRoleId,
      isActive: true,
    })
    .returning({ id: employees.id });
  requestorEmployeeId = requireId(requestor, "employees (requestor fixture)");

  // Fixture for the specificity-tier test: an exact-category policy with no
  // amount constraint (tier 2) at a deliberately high (low-priority-looking)
  // priority number, competing against whatever "any"-category policies
  // (tier 3/4) already exist for PRs — tier must win regardless of priority.
  const [tierPolicy] = await db
    .insert(approvalPolicies)
    .values({
      name: `${NAME_PREFIX}misc_pr_exact_category`,
      isActive: true,
      priority: 999999,
      docType: "pr",
      subDocType: "misc",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
      createdBy: ownerEmployeeId,
      lastUpdatedBy: ownerEmployeeId,
    })
    .returning({ id: approvalPolicies.id });
  tierFixturePolicyId = requireId(
    tierPolicy,
    "approval_policies (tier fixture)",
  );

  // Fixture for the end-to-end submitRequest test (doc section 7, scenario 1:
  // "Expensive Tooling Purchase" -> Owner-only chain). Uses its own priority
  // so it doesn't collide with the real seeded "Tooling PR" policy if present.
  const [toolingPolicy] = await db
    .insert(approvalPolicies)
    .values({
      name: `${NAME_PREFIX}tooling_pr_owner_chain`,
      isActive: true,
      priority: 999998,
      docType: "pr",
      subDocType: "tooling",
      autoApprove: false,
      approvalLevels: 1,
      approvalChain: [{ level: 1, approverType: "role", role: "owner" }],
      createdBy: ownerEmployeeId,
      lastUpdatedBy: ownerEmployeeId,
    })
    .returning({ id: approvalPolicies.id });
  toolingPrPolicyId = requireId(
    toolingPolicy,
    "approval_policies (tooling fixture)",
  );

  const [pr] = await db
    .insert(purchaseRequests)
    .values({
      prNumber: `${NAME_PREFIX}PR-0001`,
      type: "tooling",
      requestedBy: requestorEmployeeId,
      estimatedAmountPaise: 15_000_000, // ₹1,50,000
    })
    .returning({ id: purchaseRequests.id });
  toolingPrId = requireId(pr, "purchase_requests (tooling PR fixture)");
});

afterAll(async () => {
  if (createdRequestId) {
    await db
      .delete(approvalTrails)
      .where(eq(approvalTrails.requestId, createdRequestId));
    await db
      .delete(approvalRequests)
      .where(eq(approvalRequests.id, createdRequestId));
  }
  await db.delete(purchaseRequests).where(eq(purchaseRequests.id, toolingPrId));
  await db
    .delete(approvalPolicies)
    .where(
      inArray(approvalPolicies.id, [tierFixturePolicyId, toolingPrPolicyId]),
    );
  await db
    .delete(employees)
    .where(inArray(employees.id, [ownerEmployeeId, requestorEmployeeId]));
  await db.delete(roles).where(eq(roles.id, plainRoleId));
  // No disconnectDb() here: all test files share one client in one process;
  // src/test/setup-env.ts closes it once after every file has run.
});

describe("approvalRepository.findMatchingActivePolicy", () => {
  test("an exact-category policy outranks an 'any'-category policy regardless of priority number", async () => {
    const match = await approvalRepository.findMatchingActivePolicy({
      docType: "pr",
      subDocType: "misc",
      amountPaise: 3_000_000, // ₹30k — also within the seeded "any" 10k-50k range, if present
    });

    expect(match).toBeDefined();
    expect(match?.id).toBe(tierFixturePolicyId);
  });
});

describe("approvalService.submitRequest", () => {
  test("resolves an expensive tooling PR to the Owner-only chain (doc section 7, scenario 1)", async () => {
    const actor = await loadActor(requestorEmployeeId);
    if (!actor) {
      throw new Error("Fixture setup: requestor actor not found");
    }
    const created = await approvalService.submitRequest(
      { docType: "pr", docId: toolingPrId },
      requestorEmployeeId,
      actor,
    );

    if (!created) {
      throw new Error("submitRequest did not return a created request");
    }

    createdRequestId = created.id;
    expect(created.totalLevels).toBe(1);
    expect(created.currentApproverRole).toBe("owner");
    expect(created.chainSnapshot).toEqual([
      { level: 1, approverType: "role", role: "owner" },
    ]);
  });
});
