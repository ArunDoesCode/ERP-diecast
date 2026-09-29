import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  lte,
  notExists,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db/client";
import { roles } from "../db/schemas/01_auth";
import {
  type ApprovalChainStep,
  approvalPolicies,
  approvalRequests,
  approvalTrails,
} from "../db/schemas/02_procurement-approval";
import {
  prPoItemLinks,
  purchaseOrderItems,
  purchaseOrders,
  purchaseRequestItems,
  purchaseRequests,
  subcontractingOrders,
} from "../db/schemas/02_procurement-purchasing";
import { supplierMaster } from "../db/schemas/02_procurement-suppliers";
import { employees } from "../db/schemas/03_hcm";
import { fallbackPolicyName } from "../lib/approval-fallback";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 1. Base Drizzle Types (Source of Truth)
type PolicyInsert = typeof approvalPolicies.$inferInsert;
type PolicySelect = typeof approvalPolicies.$inferSelect;
type RequestInsert = typeof approvalRequests.$inferInsert;
type RequestSelect = typeof approvalRequests.$inferSelect;
type ApprovalTrailInsert = typeof approvalTrails.$inferInsert;

export type ApprovalDocType = RequestSelect["docType"];
export type ApprovalStatus = RequestSelect["status"];

// 3. API Payloads (Use Omit instead of Pick!)
// This automatically includes new columns you add to the DB later.
export type CreatePolicyData = Omit<
  PolicyInsert,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdatePolicyData = Partial<
  // Prevent changing immutable fields like ID, creation date, or doc type
  Omit<PolicyInsert, "id" | "createdAt" | "createdBy" | "docType">
> & { lastUpdatedAt: Date };

export type CreateRequestData = Omit<
  RequestInsert,
  "id" | "createdAt" | "updatedAt"
>;

export type UpdateRequestData = Partial<
  Omit<RequestInsert, "id" | "createdAt" | "docType" | "docId" | "policyId">
>;

// 4. Complex Query DTOs (Use Intersection `&` instead of rewriting 15 fields)
export type ApprovalDocSummary = {
  docNumber: string;
  amountPaise: number;
  supplierName?: string | null;
};

// Instead of manually typing id, docType, status, etc., just extend the base Drizzle type!
// If you add a column to `approvalRequests` in the DB, it automatically appears here.
export type RequestListRow = RequestSelect & {
  policyName: string;
  docSummary: ApprovalDocSummary;
};

// Input params remain custom because they aren't DB tables
type PolicyListParams = {
  page: number;
  pageSize: number;
  docType?: ApprovalDocType;
  isActive?: boolean;
  q?: string;
  sortBy?: string;
  sortDir: "asc" | "desc";
};

type PolicyMatchInput = {
  docType: ApprovalDocType;
  subDocType: PolicySelect["subDocType"];
  amountPaise: number;
};

const fallbackDocSummary = (docId: number): ApprovalDocSummary => ({
  docNumber: String(docId),
  amountPaise: 0,
});

async function fetchDocSummaries(
  docType: ApprovalDocType,
  docIds: number[],
): Promise<Map<number, ApprovalDocSummary>> {
  if (docIds.length === 0) {
    return new Map();
  }

  if (docType === "pr") {
    const rows = await db
      .select({
        id: purchaseRequests.id,
        docNumber: purchaseRequests.prNumber,
        amountPaise: purchaseRequests.estimatedAmountPaise,
      })
      .from(purchaseRequests)
      .where(inArray(purchaseRequests.id, docIds));
    return new Map(
      rows.map((row) => [
        row.id,
        { docNumber: row.docNumber, amountPaise: row.amountPaise },
      ]),
    );
  }

  if (docType === "po") {
    const rows = await db
      .select({
        id: purchaseOrders.id,
        docNumber: purchaseOrders.poNumber,
        amountPaise: purchaseOrders.totalAmountPaise,
        supplierName: supplierMaster.name,
      })
      .from(purchaseOrders)
      .leftJoin(
        supplierMaster,
        eq(supplierMaster.id, purchaseOrders.supplierId),
      )
      .where(inArray(purchaseOrders.id, docIds));
    return new Map(
      rows.map((row) => [
        row.id,
        {
          docNumber: row.docNumber,
          amountPaise: row.amountPaise,
          supplierName: row.supplierName,
        },
      ]),
    );
  }

  const rows = await db
    .select({
      id: subcontractingOrders.id,
      docNumber: subcontractingOrders.scoNumber,
    })
    .from(subcontractingOrders)
    .where(inArray(subcontractingOrders.id, docIds));
  return new Map(
    rows.map((row) => [row.id, { docNumber: row.docNumber, amountPaise: 0 }]),
  );
}

const policyColumns = {
  id: approvalPolicies.id,
  name: approvalPolicies.name,
  description: approvalPolicies.description,
  isActive: approvalPolicies.isActive,
  priority: approvalPolicies.priority,
  docType: approvalPolicies.docType,
  subDocType: approvalPolicies.subDocType,
  isSaleOrderLinked: approvalPolicies.isSaleOrderLinked,
  minAmountPaise: approvalPolicies.minAmountPaise,
  maxAmountPaise: approvalPolicies.maxAmountPaise,
  autoApprove: approvalPolicies.autoApprove,
  approvalLevels: approvalPolicies.approvalLevels,
  approvalChain: approvalPolicies.approvalChain,
  createdAt: approvalPolicies.createdAt,
  createdBy: approvalPolicies.createdBy,
  lastUpdatedAt: approvalPolicies.lastUpdatedAt,
  lastUpdatedBy: approvalPolicies.lastUpdatedBy,
};

const requestColumns = {
  id: approvalRequests.id,
  docType: approvalRequests.docType,
  docId: approvalRequests.docId,
  policyId: approvalRequests.policyId,
  status: approvalRequests.status,
  currentLevel: approvalRequests.currentLevel,
  totalLevels: approvalRequests.totalLevels,
  chainSnapshot: approvalRequests.chainSnapshot,
  currentApproverRole: approvalRequests.currentApproverRole,
  currentApproverEmployeeId: approvalRequests.currentApproverEmployeeId,
  requestedBy: approvalRequests.requestedBy,
  requestedAt: approvalRequests.requestedAt,
  completedAt: approvalRequests.completedAt,
};

const policySortColumns = {
  name: approvalPolicies.name,
  priority: approvalPolicies.priority,
  docType: approvalPolicies.docType,
  isActive: approvalPolicies.isActive,
  createdAt: approvalPolicies.createdAt,
} as const;

const pendingRequestSortColumns = {
  requestedAt: approvalRequests.requestedAt,
  docType: approvalRequests.docType,
  status: approvalRequests.status,
} as const;

const trailColumns = {
  id: approvalTrails.id,
  requestId: approvalTrails.requestId,
  docType: approvalTrails.docType,
  docId: approvalTrails.docId,
  level: approvalTrails.level,
  action: approvalTrails.action,
  actionBy: approvalTrails.actionBy,
  actionAt: approvalTrails.actionAt,
  notes: approvalTrails.notes,
};

export const approvalRepository = {
  async listPolicies(params: PolicyListParams) {
    const sortColumn =
      params.sortBy && params.sortBy in policySortColumns
        ? policySortColumns[params.sortBy as keyof typeof policySortColumns]
        : approvalPolicies.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const filters = [
      params.docType ? eq(approvalPolicies.docType, params.docType) : undefined,
      params.isActive !== undefined
        ? eq(approvalPolicies.isActive, params.isActive)
        : undefined,
      params.q ? ilike(approvalPolicies.name, `%${params.q}%`) : undefined,
    ].filter((filter) => filter !== undefined);

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totalRow]] = whereClause
      ? await Promise.all([
          db
            .select(policyColumns)
            .from(approvalPolicies)
            .where(whereClause)
            .orderBy(orderFn(sortColumn), asc(approvalPolicies.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db
            .select({ value: count() })
            .from(approvalPolicies)
            .where(whereClause),
        ])
      : await Promise.all([
          db
            .select(policyColumns)
            .from(approvalPolicies)
            .orderBy(orderFn(sortColumn), asc(approvalPolicies.id))
            .limit(params.pageSize)
            .offset((params.page - 1) * params.pageSize),
          db.select({ value: count() }).from(approvalPolicies),
        ]);

    return {
      rows,
      total: totalRow?.value ?? 0,
    };
  },

  async findPolicyById(id: number) {
    const [row] = await db
      .select()
      .from(approvalPolicies)
      .where(eq(approvalPolicies.id, id))
      .limit(1);

    return row;
  },

  async createPolicy(data: CreatePolicyData) {
    const [row] = await db
      .insert(approvalPolicies)
      .values(data)
      .returning(policyColumns);
    return row;
  },

  async updatePolicyById(
    id: number,
    data: Partial<typeof approvalPolicies.$inferInsert>,
  ) {
    const [row] = await db
      .update(approvalPolicies)
      .set(data)
      .where(eq(approvalPolicies.id, id))
      .returning();

    return row;
  },

  async findMatchingActivePolicy(input: PolicyMatchInput) {
    const subDocTypeFilter = or(
      eq(approvalPolicies.subDocType, "any"),
      eq(approvalPolicies.subDocType, input.subDocType),
    );

    // Specificity ranking (BR-APR-19): an exact category match always outranks
    // an "any" category match, regardless of priority number.
    const specificityTier = sql<number>`
      case
        when ${approvalPolicies.subDocType} != 'any'
          and (${approvalPolicies.minAmountPaise} is not null or ${approvalPolicies.maxAmountPaise} is not null)
          then 1
        when ${approvalPolicies.subDocType} != 'any' then 2
        when ${approvalPolicies.minAmountPaise} is not null or ${approvalPolicies.maxAmountPaise} is not null then 3
        else 4
      end
    `;

    const [row] = await db
      .select(policyColumns)
      .from(approvalPolicies)
      .where(
        and(
          eq(approvalPolicies.isActive, true),
          eq(approvalPolicies.docType, input.docType),
          subDocTypeFilter,
          or(
            isNull(approvalPolicies.minAmountPaise),
            lte(approvalPolicies.minAmountPaise, input.amountPaise),
          ),
          or(
            isNull(approvalPolicies.maxAmountPaise),
            gt(approvalPolicies.maxAmountPaise, input.amountPaise),
          ),
        ),
      )
      .orderBy(
        specificityTier,
        asc(approvalPolicies.priority),
        asc(approvalPolicies.id),
      )
      .limit(1);

    return row;
  },

  /**
   * BR-APR-22: the built-in fallback (one owner step) is an inactive record
   * kept in seed data, so it never competes as a candidate. Read-only here.
   */
  async findFallbackPolicy(docType: ApprovalDocType) {
    const [row] = await db
      .select(policyColumns)
      .from(approvalPolicies)
      .where(
        and(
          eq(approvalPolicies.name, fallbackPolicyName(docType)),
          eq(approvalPolicies.docType, docType),
          eq(approvalPolicies.isActive, false),
        ),
      )
      .orderBy(asc(approvalPolicies.id))
      .limit(1);

    return row;
  },

  async findEmployeeWithRoleById(employeeId: number) {
    const [row] = await db
      .select({
        id: employees.id,
        isActive: employees.isActive,
        roleId: employees.roleId,
        roleName: roles.name,
      })
      .from(employees)
      .innerJoin(roles, eq(roles.id, employees.roleId))
      .where(eq(employees.id, employeeId))
      .limit(1);

    return row;
  },

  async countActiveEmployeesByRoleName(roleName: string) {
    const [row] = await db
      .select({ value: count() })
      .from(employees)
      .innerJoin(roles, eq(roles.id, employees.roleId))
      .where(and(eq(roles.name, roleName), eq(employees.isActive, true)));

    return row?.value ?? 0;
  },

  async findPendingRequestByDoc(
    docType: ApprovalDocType,
    docId: number,
    tx?: Tx,
  ) {
    const executor = tx ?? db;

    const [row] = await executor
      .select(requestColumns)
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.docType, docType),
          eq(approvalRequests.docId, docId),
          eq(approvalRequests.status, "pending_approval"),
        ),
      )
      .orderBy(desc(approvalRequests.id))
      .limit(1);

    return row;
  },

  async createRequest(data: CreateRequestData, tx: Tx) {
    const [row] = await tx
      .insert(approvalRequests)
      .values(data)
      .returning(requestColumns);
    return row;
  },

  async updateRequestById(requestId: number, data: UpdateRequestData, tx: Tx) {
    const [row] = await tx
      .update(approvalRequests)
      .set(data)
      .where(eq(approvalRequests.id, requestId))
      .returning(requestColumns);

    return row;
  },

  async insertTrail(data: ApprovalTrailInsert, tx: Tx) {
    const [row] = await tx
      .insert(approvalTrails)
      .values(data)
      .returning(trailColumns);
    return row;
  },

  async lockRequestById(requestId: number, tx: Tx) {
    await tx.execute(
      sql`select ${approvalRequests.id} from ${approvalRequests} where ${approvalRequests.id} = ${requestId} for update`,
    );
  },

  async findRequestById(requestId: number, tx?: Tx) {
    const executor = tx ?? db;

    const [row] = await executor
      .select(requestColumns)
      .from(approvalRequests)
      .where(eq(approvalRequests.id, requestId))
      .limit(1);

    return row;
  },

  async findRequestDetailsById(requestId: number) {
    const [row] = await db
      .select({
        ...requestColumns,
        policyName: approvalPolicies.name,
        policyDescription: approvalPolicies.description,
      })
      .from(approvalRequests)
      .innerJoin(
        approvalPolicies,
        eq(approvalPolicies.id, approvalRequests.policyId),
      )
      .where(eq(approvalRequests.id, requestId))
      .limit(1);

    if (!row) {
      return row;
    }

    const summaries = await fetchDocSummaries(row.docType, [row.docId]);
    const docSummary =
      summaries.get(row.docId) ?? fallbackDocSummary(row.docId);

    return { ...row, docSummary };
  },

  async listRequestTrail(requestId: number) {
    return db
      .select({
        ...trailColumns,
        actorName: employees.name,
      })
      .from(approvalTrails)
      .innerJoin(employees, eq(employees.id, approvalTrails.actionBy))
      .where(eq(approvalTrails.requestId, requestId))
      .orderBy(asc(approvalTrails.actionAt), asc(approvalTrails.id));
  },

  /** BR-APR-33: has this employee already approved a level of the request? */
  async hasEmployeeApproved(requestId: number, employeeId: number, tx?: Tx) {
    const executor = tx ?? db;
    const [row] = await executor
      .select({ id: approvalTrails.id })
      .from(approvalTrails)
      .where(
        and(
          eq(approvalTrails.requestId, requestId),
          eq(approvalTrails.action, "approved"),
          eq(approvalTrails.actionBy, employeeId),
        ),
      )
      .limit(1);

    return row !== undefined;
  },

  /** BR-APR-54: every request of a document, newest first, trails oldest first. */
  async listRequestsWithTrailByDoc(docType: ApprovalDocType, docId: number) {
    const requests = await db
      .select({ ...requestColumns, policyName: approvalPolicies.name })
      .from(approvalRequests)
      .innerJoin(
        approvalPolicies,
        eq(approvalPolicies.id, approvalRequests.policyId),
      )
      .where(
        and(
          eq(approvalRequests.docType, docType),
          eq(approvalRequests.docId, docId),
        ),
      )
      .orderBy(desc(approvalRequests.id));

    if (requests.length === 0) {
      return [];
    }

    const trailRows = await db
      .select({ ...trailColumns, actorName: employees.name })
      .from(approvalTrails)
      .innerJoin(employees, eq(employees.id, approvalTrails.actionBy))
      .where(
        inArray(
          approvalTrails.requestId,
          requests.map((request) => request.id),
        ),
      )
      .orderBy(asc(approvalTrails.actionAt), asc(approvalTrails.id));

    const summaries = await fetchDocSummaries(docType, [docId]);
    const docSummary = summaries.get(docId) ?? fallbackDocSummary(docId);

    return requests.map((request) => ({
      ...request,
      docSummary,
      trail: trailRows.filter((trail) => trail.requestId === request.id),
    }));
  },

  async listPendingRequests(params: {
    actorRole: string;
    employeeId: number;
    page: number;
    pageSize: number;
    docType?: ApprovalDocType | undefined;
    sortBy?: string | undefined;
    sortDir: "asc" | "desc";
  }): Promise<{ rows: RequestListRow[]; total: number }> {
    const sortColumn =
      params.sortBy && params.sortBy in pendingRequestSortColumns
        ? pendingRequestSortColumns[
            params.sortBy as keyof typeof pendingRequestSortColumns
          ]
        : approvalRequests.id;
    const orderFn = params.sortDir === "desc" ? desc : asc;

    const filters = [
      eq(approvalRequests.status, "pending_approval"),
      or(
        eq(approvalRequests.currentApproverRole, params.actorRole),
        eq(approvalRequests.currentApproverEmployeeId, params.employeeId),
      ),
      params.docType ? eq(approvalRequests.docType, params.docType) : undefined,
      // BR-APR-33: hide requests this employee already approved a level of.
      notExists(
        db
          .select({ one: sql`1` })
          .from(approvalTrails)
          .where(
            and(
              eq(approvalTrails.requestId, approvalRequests.id),
              eq(approvalTrails.action, "approved"),
              eq(approvalTrails.actionBy, params.employeeId),
            ),
          ),
      ),
    ].filter((filter) => filter !== undefined);

    const whereClause = and(...filters);

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          ...requestColumns,
          policyName: approvalPolicies.name,
        })
        .from(approvalRequests)
        .innerJoin(
          approvalPolicies,
          eq(approvalPolicies.id, approvalRequests.policyId),
        )
        .where(whereClause)
        .orderBy(orderFn(sortColumn), asc(approvalRequests.id))
        .limit(params.pageSize)
        .offset((params.page - 1) * params.pageSize),
      db.select({ value: count() }).from(approvalRequests).where(whereClause),
    ]);

    const docIdsByType: Record<ApprovalDocType, number[]> = {
      pr: [],
      po: [],
      sco: [],
    };
    for (const row of rows) {
      docIdsByType[row.docType].push(row.docId);
    }

    const summaryMaps = new Map<
      ApprovalDocType,
      Map<number, ApprovalDocSummary>
    >();
    for (const docType of ["pr", "po", "sco"] as const) {
      const docIds = docIdsByType[docType];
      if (docIds.length > 0) {
        summaryMaps.set(docType, await fetchDocSummaries(docType, docIds));
      }
    }

    const enrichedRows: RequestListRow[] = rows.map((row) => {
      const docSummary =
        summaryMaps.get(row.docType)?.get(row.docId) ??
        fallbackDocSummary(row.docId);
      return { ...row, docSummary };
    });

    return { rows: enrichedRows, total: totalRow?.value ?? 0 };
  },

  async findCurrentApprovalByDoc(docType: ApprovalDocType, docId: number) {
    const [row] = await db
      .select({
        ...requestColumns,
        policyName: approvalPolicies.name,
      })
      .from(approvalRequests)
      .innerJoin(
        approvalPolicies,
        eq(approvalPolicies.id, approvalRequests.policyId),
      )
      .where(
        and(
          eq(approvalRequests.docType, docType),
          eq(approvalRequests.docId, docId),
          eq(approvalRequests.status, "pending_approval"),
        ),
      )
      .orderBy(desc(approvalRequests.id))
      .limit(1);

    if (!row) {
      return row;
    }

    const summaries = await fetchDocSummaries(docType, [docId]);
    const docSummary = summaries.get(docId) ?? fallbackDocSummary(docId);

    return { ...row, docSummary };
  },

  async updatePrApprovalMirror(
    prId: number,
    input: {
      status?: (typeof purchaseRequests.$inferSelect)["status"];
      currentApprovalLevel?: number;
      totalApprovalLevels?: number;
      approvedBy?: number | null;
    },
    tx?: Tx,
  ) {
    const executor = tx ?? db;

    const [row] = await executor
      .update(purchaseRequests)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.currentApprovalLevel !== undefined
          ? { currentApprovalLevel: input.currentApprovalLevel }
          : {}),
        ...(input.totalApprovalLevels !== undefined
          ? { totalApprovalLevels: input.totalApprovalLevels }
          : {}),
        ...(input.approvedBy !== undefined
          ? { approvedBy: input.approvedBy }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(purchaseRequests.id, prId))
      .returning({ id: purchaseRequests.id });

    return row;
  },

  async updatePoApprovalMirror(
    poId: number,
    input: {
      status?: (typeof purchaseOrders.$inferSelect)["status"];
      currentApprovalLevel?: number;
      totalApprovalLevels?: number;
      approvedBy?: number | null;
    },
    tx?: Tx,
  ) {
    const executor = tx ?? db;

    const [row] = await executor
      .update(purchaseOrders)
      .set({
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.currentApprovalLevel !== undefined
          ? { currentApprovalLevel: input.currentApprovalLevel }
          : {}),
        ...(input.totalApprovalLevels !== undefined
          ? { totalApprovalLevels: input.totalApprovalLevels }
          : {}),
        ...(input.approvedBy !== undefined
          ? { approvedBy: input.approvedBy }
          : {}),
      })
      .where(eq(purchaseOrders.id, poId))
      .returning({ id: purchaseOrders.id });

    return row;
  },

  async updateScoApprovalMirror(
    scoId: number,
    input: {
      status?: (typeof subcontractingOrders.$inferSelect)["status"];
    },
    tx?: Tx,
  ) {
    const executor = tx ?? db;

    const [row] = await executor
      .update(subcontractingOrders)
      .set({ ...(input.status !== undefined ? { status: input.status } : {}) })
      .where(eq(subcontractingOrders.id, scoId))
      .returning({ id: subcontractingOrders.id });

    return row;
  },

  /** Common PR type of the PO's source lines; none or mixed = "any" (BR-APR-21). */
  async findPoCategory(poId: number): Promise<PolicySelect["subDocType"]> {
    const rows = await db
      .selectDistinct({ type: purchaseRequests.type })
      .from(purchaseOrderItems)
      .innerJoin(
        prPoItemLinks,
        eq(prPoItemLinks.poItemId, purchaseOrderItems.id),
      )
      .innerJoin(
        purchaseRequestItems,
        eq(purchaseRequestItems.id, prPoItemLinks.prItemId),
      )
      .innerJoin(
        purchaseRequests,
        eq(purchaseRequests.id, purchaseRequestItems.prId),
      )
      .where(eq(purchaseOrderItems.poId, poId));

    const [only] = rows;
    return rows.length === 1 && only ? only.type : "any";
  },

  async findDocumentContext(docType: ApprovalDocType, docId: number) {
    if (docType === "pr") {
      const [row] = await db
        .select({
          id: purchaseRequests.id,
          type: purchaseRequests.type,
          amountPaise: purchaseRequests.estimatedAmountPaise,
          status: purchaseRequests.status,
          createdBy: purchaseRequests.requestedBy,
        })
        .from(purchaseRequests)
        .where(eq(purchaseRequests.id, docId))
        .limit(1);

      if (!row) {
        return undefined;
      }

      return {
        docType,
        docId: row.id,
        subDocType: row.type,
        amountPaise: row.amountPaise,
        status: row.status,
        createdBy: row.createdBy,
      };
    }

    if (docType === "po") {
      const [row] = await db
        .select({
          id: purchaseOrders.id,
          amountPaise: purchaseOrders.totalAmountPaise,
          status: purchaseOrders.status,
          createdBy: purchaseOrders.createdBy,
        })
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, docId))
        .limit(1);

      if (!row) {
        return undefined;
      }

      return {
        docType,
        docId: row.id,
        // BR-APR-21: the common type of the source PRs, mixed = any.
        subDocType: await this.findPoCategory(row.id),
        amountPaise: row.amountPaise ?? 0,
        status: row.status,
        createdBy: row.createdBy,
      };
    }

    const [row] = await db
      .select({
        id: subcontractingOrders.id,
        status: subcontractingOrders.status,
        createdBy: subcontractingOrders.createdBy,
      })
      .from(subcontractingOrders)
      .where(eq(subcontractingOrders.id, docId))
      .limit(1);

    if (!row) {
      return undefined;
    }

    return {
      docType,
      docId: row.id,
      subDocType: "any" as const,
      amountPaise: 0,
      status: row.status,
      createdBy: row.createdBy,
    };
  },

  async cancelOpenRequestForDocument(
    docType: ApprovalDocType,
    docId: number,
    reason?: string,
    options: { actorId?: number; notes?: string; tx?: Tx } = {},
  ) {
    const run = async (tx: Tx) => {
      const openRequest = await this.findPendingRequestByDoc(
        docType,
        docId,
        tx,
      );
      if (!openRequest) {
        return null;
      }

      const [updatedRequest] = await tx
        .update(approvalRequests)
        .set({ status: "cancelled", completedAt: new Date() })
        .where(
          and(
            eq(approvalRequests.id, openRequest.id),
            eq(approvalRequests.status, "pending_approval"),
          ),
        )
        .returning(requestColumns);

      if (!updatedRequest) {
        return null;
      }

      await tx.insert(approvalTrails).values({
        requestId: updatedRequest.id,
        docType,
        docId,
        level: updatedRequest.currentLevel,
        action: "cancelled",
        actionBy: options.actorId ?? updatedRequest.requestedBy,
        notes:
          options.notes ??
          (reason
            ? `Approval cancelled because source document was cancelled: ${reason}`
            : "Approval cancelled because source document was cancelled"),
      });

      return updatedRequest;
    };
    return options.tx ? run(options.tx) : db.transaction(run);
  },
};
