import { db } from "../db/client";
import { type Actor, can } from "../lib/auth-middleware";
import { isUniqueViolation } from "../lib/db-errors";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
} from "../lib/errors";
import { approvalRepository } from "../repository/approvalRepository";
import { poRepository } from "../repository/poRepository";
import { prRepository } from "../repository/prRepository";
import { scoRepository } from "../repository/scoRepository";
import type {
  approvalActionRequestSchemaType,
  approvalChainSchemaType,
  approvalDocLookupParamSchemaType,
  approvalPolicyIdParamSchemaType,
  approvalPolicyListQuerySchemaType,
  approvalRequestIdParamSchemaType,
  createApprovalPolicySchemaType,
  myPendingApprovalsQuerySchemaType,
  submitApprovalRequestSchemaType,
  updateApprovalPolicySchemaType,
} from "../types/approval.types";

type ActorContext = {
  actorId: number;
  actor: Actor;
};

type ApprovalRequestStatus =
  | "pending_approval"
  | "approved"
  | "rejected"
  | "require_more_info"
  | "partial_ordered"
  | "fully_ordered"
  | "auto_approved"
  | "cancelled";

type ApprovalTrailAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "require_more_info"
  | "auto_approved"
  | "cancelled";

type ApprovalRequestRow = Awaited<
  ReturnType<typeof approvalRepository.findRequestById>
>;

type CreatedApprovalRequest = Awaited<
  ReturnType<typeof approvalRepository.createRequest>
>;

function toPaginatedMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function getChainStep(
  chain: approvalChainSchemaType,
  level: number,
): approvalChainSchemaType[number] {
  const step = chain.find((item) => item.level === level);
  if (!step) {
    throw new BadRequestError(`Approval chain level ${level} is missing`);
  }
  return step;
}

function currentApproverFields(chain: approvalChainSchemaType, level: number) {
  const step = getChainStep(chain, level);
  return step.approverType === "specific"
    ? {
        currentApproverRole: null,
        currentApproverEmployeeId: step.employeeId ?? null,
      }
    : {
        currentApproverRole: step.role ?? null,
        currentApproverEmployeeId: null,
      };
}

const POLICY_SLOT_TAKEN_MESSAGE =
  "An active policy with the same priority, doc type and category already exists";

function slotTakenError() {
  return new ConflictError(POLICY_SLOT_TAKEN_MESSAGE, "POLICY_PRIORITY_TAKEN");
}

function toTrailAction(action: approvalActionRequestSchemaType["action"]) {
  const mapped: Record<
    approvalActionRequestSchemaType["action"],
    ApprovalTrailAction
  > = {
    approve: "approved",
    reject: "rejected",
    sent_back: "require_more_info",
    withdraw: "cancelled",
  };

  return mapped[action];
}

function canSubmitForApproval(status: string) {
  return status === "draft";
}

async function assertCanReadRequest(
  request: NonNullable<ApprovalRequestRow>,
  actor: ActorContext,
) {
  if (can(actor.actor, "approval.view_all")) {
    return;
  }

  if (request.requestedBy === actor.actorId) {
    return;
  }

  const actorEmployee = await approvalRepository.findEmployeeWithRoleById(
    actor.actorId,
  );
  if (!actorEmployee?.isActive) {
    throw new ForbiddenError("Active actor record required");
  }

  const actorCanViewByChain = request.chainSnapshot.some((step) => {
    if (step.approverType === "specific") {
      return step.employeeId === actor.actorId;
    }

    return step.role === actorEmployee.roleName;
  });

  if (!actorCanViewByChain) {
    throw new ForbiddenError("You are not allowed to view this approval");
  }
}

async function assertChainHasEligibleApprovers(chain: approvalChainSchemaType) {
  for (const step of chain) {
    if (step.approverType === "role") {
      const roleName = step.role;
      const activeCount = roleName
        ? await approvalRepository.countActiveEmployeesByRoleName(roleName)
        : 0;
      if (activeCount === 0) {
        throw new BadRequestError(
          `Approval step ${step.level} has no active employee with role ${roleName ?? "(missing)"}`,
          "APPROVAL_NO_ELIGIBLE_APPROVER",
        );
      }
      continue;
    }

    const approver = step.employeeId
      ? await approvalRepository.findEmployeeWithRoleById(step.employeeId)
      : undefined;
    if (!approver?.isActive) {
      throw new BadRequestError(
        `Approval step ${step.level} names employee ${step.employeeId ?? "(missing)"}, who is missing or inactive`,
        "APPROVAL_NO_ELIGIBLE_APPROVER",
      );
    }
  }
}

async function assertEligibleActorForCurrentStep(
  chain: approvalChainSchemaType,
  level: number,
  actorId: number,
) {
  const actor = await approvalRepository.findEmployeeWithRoleById(actorId);
  if (!actor?.isActive) {
    throw new ForbiddenError("Active actor record required");
  }

  const step = getChainStep(chain, level);
  if (step.approverType === "specific") {
    if (step.employeeId !== actorId) {
      throw new ForbiddenError("Only assigned approver can act at this level");
    }
    return;
  }

  if (!step.role || actor.roleName !== step.role) {
    throw new ForbiddenError(
      "Current level requires a different approver role",
    );
  }
}

export const approvalService = {
  async getPolicies(query: approvalPolicyListQuerySchemaType) {
    const { rows, total } = await approvalRepository.listPolicies({
      page: query.page,
      pageSize: query.pageSize,
      sortDir: query.sortDir,
      ...(query.sortBy !== undefined ? { sortBy: query.sortBy } : {}),
      ...(query.docType !== undefined ? { docType: query.docType } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
    });
    return {
      data: rows,
      meta: toPaginatedMeta(query.page, query.pageSize, total),
    };
  },

  async getPolicyDetails(params: approvalPolicyIdParamSchemaType) {
    const row = await approvalRepository.findPolicyById(params.id);
    if (!row) {
      throw new NotFoundError("Approval policy not found");
    }

    return row;
  },

  async createPolicy(input: createApprovalPolicySchemaType, actorId: number) {
    const data = {
      name: input.name,
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      priority: input.priority,
      docType: input.docType,
      subDocType: input.subDocType,
      minAmountPaise: input.minAmountPaise ?? null,
      maxAmountPaise: input.maxAmountPaise ?? null,
      autoApprove: input.autoApprove ?? false,
      approvalLevels: input.approvalChain.length,
      approvalChain: input.approvalChain,
      createdBy: actorId,
      lastUpdatedBy: actorId,
    };

    try {
      const row = await approvalRepository.createPolicy(data);
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw slotTakenError();
      }
      throw error;
    }
  },

  async updatePolicy(
    policyId: number,
    input: updateApprovalPolicySchemaType,
    actorId: number,
  ) {
    const existing = await approvalRepository.findPolicyById(policyId);
    if (!existing) {
      throw new NotFoundError("Approval policy not found");
    }

    // BR-APR-05 / 06: the checks run on the stored values plus the change.
    const effectiveMin =
      input.minAmountPaise !== undefined
        ? input.minAmountPaise
        : existing.minAmountPaise;
    const effectiveMax =
      input.maxAmountPaise !== undefined
        ? input.maxAmountPaise
        : existing.maxAmountPaise;
    if (
      effectiveMin !== null &&
      effectiveMax !== null &&
      effectiveMax <= effectiveMin
    ) {
      throw new BadRequestError(
        "maxAmountPaise must be greater than minAmountPaise",
      );
    }

    const effectiveAutoApprove = input.autoApprove ?? existing.autoApprove;
    const effectiveChain = input.approvalChain ?? existing.approvalChain;
    if (!effectiveAutoApprove && effectiveChain.length === 0) {
      throw new BadRequestError(
        "approvalChain needs at least one step unless autoApprove",
      );
    }

    const data = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.subDocType !== undefined
        ? { subDocType: input.subDocType }
        : {}),
      ...(input.minAmountPaise !== undefined
        ? { minAmountPaise: input.minAmountPaise }
        : {}),
      ...(input.maxAmountPaise !== undefined
        ? { maxAmountPaise: input.maxAmountPaise }
        : {}),
      ...(input.autoApprove !== undefined
        ? { autoApprove: input.autoApprove }
        : {}),
      ...(input.approvalChain !== undefined
        ? {
            approvalChain: input.approvalChain,
            approvalLevels: input.approvalChain.length,
          }
        : {}),
      lastUpdatedBy: actorId,
      lastUpdatedAt: new Date(),
    };

    try {
      const row = await approvalRepository.updatePolicyById(policyId, data);
      if (!row) {
        throw new NotFoundError("Approval policy not found");
      }
      return row;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw slotTakenError();
      }
      throw error;
    }
  },

  async submitRequest(
    input: submitApprovalRequestSchemaType,
    actorId: number,
    actor: Actor,
  ) {
    const doc = await approvalRepository.findDocumentContext(
      input.docType,
      input.docId,
    );
    if (!doc) {
      throw new NotFoundError("Source document not found");
    }

    if (doc.createdBy !== actorId) {
      throw new ForbiddenError(
        "Only the document creator can submit it for approval",
      );
    }

    // BR-APR-24 (v2): submit also needs the document type's own key.
    const submitKey =
      input.docType === "pr"
        ? "pr.manage"
        : input.docType === "po"
          ? "po.manage"
          : "sco.manage";
    if (submitKey && !can(actor, submitKey)) {
      throw new ForbiddenError(
        `Submitting a ${input.docType.toUpperCase()} needs the ${submitKey} permission`,
        "PERMISSION_DENIED",
      );
    }

    if (!canSubmitForApproval(doc.status)) {
      // BR-PR-19: an open request is the more specific answer than "wrong status".
      const open = await approvalRepository.findPendingRequestByDoc(
        input.docType,
        input.docId,
      );
      if (open) {
        throw new ConflictError(
          "Document already has an open approval request",
          "APPROVAL_ALREADY_OPEN",
        );
      }
      throw new ConflictError(
        `Cannot submit ${input.docType.toUpperCase()} for approval from status ${doc.status}`,
        "APPROVAL_INVALID_SOURCE_STATUS",
      );
    }

    const resolvePolicy = async (amountPaise: number) => {
      const matched =
        (await approvalRepository.findMatchingActivePolicy({
          docType: input.docType,
          subDocType: doc.subDocType,
          amountPaise,
        })) ?? (await approvalRepository.findFallbackPolicy(input.docType));
      if (!matched) {
        // BR-APR-22: the fallback lives in seed data; missing = setup error.
        throw new InternalServerError(
          "Approval fallback policy is not configured",
          "APPROVAL_FALLBACK_MISSING",
        );
      }
      return matched;
    };

    let policy = await resolvePolicy(doc.amountPaise);

    return db.transaction(async (tx) => {
      const existingPending = await approvalRepository.findPendingRequestByDoc(
        input.docType,
        input.docId,
        tx,
      );

      if (existingPending) {
        throw new ConflictError(
          "Document already has an open approval request",
          "APPROVAL_ALREADY_OPEN",
        );
      }

      // BR-PR-47: a PR is re-read under its row lock so a racing cancel or edit wins cleanly.
      if (input.docType === "pr") {
        const locked = await prRepository.findPrByIdForUpdate(input.docId, tx);
        if (!locked || !canSubmitForApproval(locked.status)) {
          // A racing submit that committed first is the more specific answer (BR-APR-26).
          const raced = await approvalRepository.findPendingRequestByDoc(
            input.docType,
            input.docId,
            tx,
          );
          if (raced) {
            throw new ConflictError(
              "Document already has an open approval request",
              "APPROVAL_ALREADY_OPEN",
            );
          }
          throw new ConflictError(
            `Cannot submit PR for approval from status ${locked?.status ?? "missing"}`,
            "APPROVAL_INVALID_SOURCE_STATUS",
          );
        }

        // BR-PR-11: estimate recomputed at submit, before the policy is picked.
        const fresh = await prRepository.recalculateEstimatedAmountByPrId(
          input.docId,
          tx,
        );
        if (fresh && fresh.estimatedAmountPaise !== doc.amountPaise) {
          policy = await resolvePolicy(fresh.estimatedAmountPaise);
        }
      }

      // BR-PO-06 / BR-PO-22: a PO is re-read under its row lock, so a racing
      // edit, cancel or second submit wins cleanly and the policy is matched on
      // the total incl. GST as it stands now.
      if (input.docType === "po") {
        const locked = await poRepository.lockPoById(input.docId, tx);
        if (!locked || !canSubmitForApproval(locked.status)) {
          const raced = await approvalRepository.findPendingRequestByDoc(
            input.docType,
            input.docId,
            tx,
          );
          if (raced) {
            throw new ConflictError(
              "Document already has an open approval request",
              "APPROVAL_ALREADY_OPEN",
            );
          }
          throw new ConflictError(
            `Cannot submit PO for approval from status ${locked?.status ?? "missing"}`,
            "APPROVAL_INVALID_SOURCE_STATUS",
          );
        }
        if (locked.totalAmountPaise !== doc.amountPaise) {
          policy = await resolvePolicy(locked.totalAmountPaise);
        }
      }

      // BL-065 / BR-SCO-06: an SCO is re-read under its row lock, so a racing
      // edit, cancel or second submit wins cleanly and the policy is matched on
      // the total incl. GST as it stands now.
      if (input.docType === "sco") {
        const locked = await scoRepository.lockById(input.docId, tx);
        if (!locked || !canSubmitForApproval(locked.status)) {
          const raced = await approvalRepository.findPendingRequestByDoc(
            input.docType,
            input.docId,
            tx,
          );
          if (raced) {
            throw new ConflictError(
              "Document already has an open approval request",
              "APPROVAL_ALREADY_OPEN",
            );
          }
          throw new ConflictError(
            `Cannot submit SCO for approval from status ${locked?.status ?? "missing"}`,
            "APPROVAL_INVALID_SOURCE_STATUS",
          );
        }
        if (locked.totalAmountPaise !== doc.amountPaise) {
          policy = await resolvePolicy(locked.totalAmountPaise);
        }
      }

      const chain = policy.approvalChain;

      // BR-APR-28 / 61: an auto-approve policy, or a requester who holds
      // approval.auto_approve_own, skips the chain.
      const autoApproved =
        policy.autoApprove === true || can(actor, "approval.auto_approve_own");
      const now = new Date();

      // BR-APR-23: not checked when the request is auto-approved.
      if (!autoApproved) {
        await assertChainHasEligibleApprovers(chain);
      }

      const approverFields = autoApproved
        ? { currentApproverRole: null, currentApproverEmployeeId: null }
        : currentApproverFields(chain, 1);

      let createdRequest: CreatedApprovalRequest;
      try {
        createdRequest = await approvalRepository.createRequest(
          {
            docType: input.docType,
            docId: input.docId,
            policyId: policy.id,
            status: autoApproved ? "approved" : "pending_approval",
            currentLevel: autoApproved ? policy.approvalLevels : 1,
            totalLevels: policy.approvalLevels,
            chainSnapshot: chain,
            requestedBy: actorId,
            completedAt: autoApproved ? now : null,
            ...approverFields,
          },
          tx,
        );
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError(
            "Document already has an open approval request",
            "APPROVAL_ALREADY_OPEN",
          );
        }
        throw error;
      }

      if (!createdRequest) {
        throw new BadRequestError("Failed to create approval request");
      }

      await approvalRepository.insertTrail(
        {
          requestId: createdRequest.id,
          docType: createdRequest.docType,
          docId: createdRequest.docId,
          level: 0,
          action: "submitted",
          actionBy: actorId,
          notes: "Approval request submitted",
        },
        tx,
      );

      if (autoApproved) {
        await approvalRepository.insertTrail(
          {
            requestId: createdRequest.id,
            docType: createdRequest.docType,
            docId: createdRequest.docId,
            level: createdRequest.totalLevels,
            action: "auto_approved",
            actionBy: actorId,
            notes: policy.autoApprove
              ? `Auto-approved by policy ${policy.name}`
              : "Auto-approved: own request",
          },
          tx,
        );
      }

      if (input.docType === "pr") {
        await approvalRepository.updatePrApprovalMirror(
          input.docId,
          {
            status: autoApproved ? "approved" : "pending_approval",
            currentApprovalLevel: createdRequest.currentLevel,
            totalApprovalLevels: createdRequest.totalLevels,
            approvedBy: null,
          },
          tx,
        );
      }

      if (input.docType === "po") {
        await approvalRepository.updatePoApprovalMirror(
          input.docId,
          {
            status: autoApproved ? "approved" : "pending_approval",
            currentApprovalLevel: createdRequest.currentLevel,
            totalApprovalLevels: createdRequest.totalLevels,
            approvedBy: null,
          },
          tx,
        );
        // BR-PR-30: an auto-approved PO orders its PR lines at once.
        if (autoApproved) {
          await poRepository.orderPrLinesOfPo(input.docId, tx);
        }
      }

      if (input.docType === "sco") {
        await approvalRepository.updateScoApprovalMirror(
          input.docId,
          {
            status: autoApproved ? "approved" : "pending_approval",
            currentApprovalLevel: createdRequest.currentLevel,
            totalApprovalLevels: createdRequest.totalLevels,
            approvedBy: null,
          },
          tx,
        );
      }

      return createdRequest;
    });
  },

  async getRequestDetails(
    params: approvalRequestIdParamSchemaType,
    actor: ActorContext,
  ) {
    const details = await approvalRepository.findRequestDetailsById(params.id);
    if (!details) {
      throw new NotFoundError("Approval request not found");
    }

    await assertCanReadRequest(details, actor);

    return details;
  },

  async getRequestTrail(
    params: approvalRequestIdParamSchemaType,
    actor: ActorContext,
  ) {
    const request = await approvalRepository.findRequestById(params.id);
    if (!request) {
      throw new NotFoundError("Approval request not found");
    }

    await assertCanReadRequest(request, actor);

    const trail = await approvalRepository.listRequestTrail(params.id);
    return trail;
  },

  async actOnRequest(
    requestId: number,
    input: approvalActionRequestSchemaType,
    actorId: number,
  ) {
    // BR-APR-37: approve, reject and send back need a typed comment.
    const notes = input.notes?.trim() ? input.notes.trim() : null;
    if (
      notes === null &&
      (input.action === "approve" ||
        input.action === "reject" ||
        input.action === "sent_back")
    ) {
      throw new BadRequestError(
        "A comment is required to approve, reject or send back",
        "APPROVAL_NOTES_REQUIRED",
      );
    }

    return db.transaction(async (tx) => {
      await approvalRepository.lockRequestById(requestId, tx);

      const request = await approvalRepository.findRequestById(requestId, tx);
      if (!request) {
        throw new NotFoundError("Approval request not found");
      }

      if (request.status !== "pending_approval") {
        throw new ConflictError(
          "Approval request is not pending",
          "APPROVAL_NOT_PENDING",
        );
      }

      const chain = request.chainSnapshot;
      if (input.action === "withdraw") {
        if (request.requestedBy !== actorId) {
          throw new ForbiddenError(
            "Only the requester can withdraw this approval",
            "APPROVAL_NOT_REQUESTER",
          );
        }
      } else {
        await assertEligibleActorForCurrentStep(
          chain,
          request.currentLevel,
          actorId,
        );

        // BR-APR-33: one employee cannot approve two levels of one request.
        if (
          input.action === "approve" &&
          (await approvalRepository.hasEmployeeApproved(
            request.id,
            actorId,
            tx,
          ))
        ) {
          throw new ForbiddenError(
            "You already approved a level of this request",
            "APPROVAL_ALREADY_ACTED",
          );
        }
      }

      let nextStatus: ApprovalRequestStatus = request.status;
      let nextLevel = request.currentLevel;
      let completionTime: Date | null = null;

      if (input.action === "approve") {
        if (request.currentLevel >= request.totalLevels) {
          nextStatus = "approved";
          completionTime = new Date();
        } else {
          nextLevel = request.currentLevel + 1;
        }
      }

      if (input.action === "reject") {
        nextStatus = "rejected";
        completionTime = new Date();
      }

      if (input.action === "sent_back") {
        nextStatus = "require_more_info";
        completionTime = new Date();
      }

      if (input.action === "withdraw") {
        nextStatus = "cancelled";
        completionTime = new Date();
      }

      const nextApproverFields =
        nextStatus === "pending_approval"
          ? currentApproverFields(chain, nextLevel)
          : { currentApproverRole: null, currentApproverEmployeeId: null };

      const updatedRequest = await approvalRepository.updateRequestById(
        request.id,
        {
          status: nextStatus,
          currentLevel: nextLevel,
          completedAt: completionTime,
          ...nextApproverFields,
        },
        tx,
      );

      if (!updatedRequest) {
        throw new NotFoundError("Approval request not found");
      }

      await approvalRepository.insertTrail(
        {
          requestId: request.id,
          docType: request.docType,
          docId: request.docId,
          level: request.currentLevel,
          action: toTrailAction(input.action),
          actionBy: actorId,
          notes,
        },
        tx,
      );

      if (request.docType === "pr") {
        // BR-PR-21 / BR-APR-39: withdraw returns the PR to draft (not cancelled).
        const prStatus =
          input.action === "withdraw"
            ? "draft"
            : nextStatus === "approved" ||
                nextStatus === "rejected" ||
                nextStatus === "cancelled" ||
                nextStatus === "pending_approval"
              ? nextStatus
              : nextStatus === "require_more_info"
                ? "draft"
                : undefined;

        await approvalRepository.updatePrApprovalMirror(
          request.docId,
          {
            ...(prStatus ? { status: prStatus } : {}),
            currentApprovalLevel: updatedRequest.currentLevel,
            totalApprovalLevels: updatedRequest.totalLevels,
            approvedBy: nextStatus === "approved" ? actorId : null,
          },
          tx,
        );
      }

      if (request.docType === "po") {
        if (input.action === "reject") {
          // BR-APR-43 / BR-PO-07: a rejected request cancels the PO
          // through the normal cancel path, so its PR lines are cancelled too.
          await poRepository.lockPoById(request.docId, tx);
          await poRepository.cancelLockedPo(
            request.docId,
            {
              actorId,
              reason: notes ?? "Approval request cancelled",
            },
            tx,
          );
          await approvalRepository.updatePoApprovalMirror(
            request.docId,
            {
              currentApprovalLevel: updatedRequest.currentLevel,
              totalApprovalLevels: updatedRequest.totalLevels,
              approvedBy: null,
            },
            tx,
          );
        } else {
          const poStatus =
            input.action === "withdraw" || nextStatus === "require_more_info"
              ? "draft"
              : nextStatus === "approved"
                ? "approved"
                : "pending_approval";

          await approvalRepository.updatePoApprovalMirror(
            request.docId,
            {
              status: poStatus,
              currentApprovalLevel: updatedRequest.currentLevel,
              totalApprovalLevels: updatedRequest.totalLevels,
              approvedBy: nextStatus === "approved" ? actorId : null,
            },
            tx,
          );

          // BR-PR-30: the last-level approve orders the PO's PR lines.
          if (nextStatus === "approved") {
            await poRepository.orderPrLinesOfPo(request.docId, tx);
          }
        }
      }

      if (request.docType === "sco") {
        // BR-APR-42: an SCO is never left at require_more_info; send back and
        // withdraw both return it to draft. Approve at a middle level keeps it pending.
        const scoStatus =
          input.action === "withdraw" || nextStatus === "require_more_info"
            ? "draft"
            : nextStatus === "approved" ||
                nextStatus === "rejected" ||
                nextStatus === "cancelled"
              ? nextStatus
              : undefined;

        await approvalRepository.updateScoApprovalMirror(
          request.docId,
          {
            ...(scoStatus ? { status: scoStatus } : {}),
            currentApprovalLevel: updatedRequest.currentLevel,
            totalApprovalLevels: updatedRequest.totalLevels,
            approvedBy: nextStatus === "approved" ? actorId : null,
          },
          tx,
        );
      }

      return updatedRequest;
    });
  },

  async getMyPendingApprovals(
    query: myPendingApprovalsQuerySchemaType,
    actor: ActorContext,
  ) {
    const targetEmployeeId = query.employeeId ?? actor.actorId;

    if (
      targetEmployeeId !== actor.actorId &&
      !can(actor.actor, "approval.view_others_pending")
    ) {
      throw new ForbiddenError(
        "You are not allowed to fetch another employee approvals",
        "PERMISSION_DENIED",
        { key: "approval.view_others_pending" },
      );
    }

    const targetEmployee =
      await approvalRepository.findEmployeeWithRoleById(targetEmployeeId);

    if (!targetEmployee?.isActive) {
      throw new NotFoundError("Employee not found or inactive");
    }

    const { rows, total } = await approvalRepository.listPendingRequests({
      actorRole: targetEmployee.roleName,
      employeeId: targetEmployeeId,
      page: query.page,
      pageSize: query.pageSize,
      sortDir: query.sortDir,
      ...(query.sortBy !== undefined ? { sortBy: query.sortBy } : {}),
      ...(query.docType !== undefined ? { docType: query.docType } : {}),
    });

    return {
      data: rows,
      meta: toPaginatedMeta(query.page, query.pageSize, total),
    };
  },

  async getCurrentApprovalByDoc(
    params: approvalDocLookupParamSchemaType,
    actor: ActorContext,
  ) {
    const request = await approvalRepository.findCurrentApprovalByDoc(
      params.docType,
      params.docId,
    );

    if (!request) {
      return null;
    }

    await assertCanReadRequest(request, actor);

    return request;
  },

  async getApprovalHistory(
    params: approvalDocLookupParamSchemaType,
    actor: ActorContext,
  ) {
    const doc = await approvalRepository.findDocumentContext(
      params.docType,
      params.docId,
    );
    if (!doc) {
      throw new NotFoundError("Source document not found");
    }

    const history = await approvalRepository.listRequestsWithTrailByDoc(
      params.docType,
      params.docId,
    );
    if (history.length === 0) {
      return [];
    }

    // BR-APR-51: show the requests this caller may read; none readable = 403.
    const readable: typeof history = [];
    let denied: unknown;
    for (const item of history) {
      try {
        await assertCanReadRequest(item, actor);
        readable.push(item);
      } catch (error) {
        if (!(error instanceof ForbiddenError)) {
          throw error;
        }
        denied = error;
      }
    }
    if (readable.length === 0 && denied) {
      throw denied;
    }

    return readable;
  },
};
