import { db } from "../db/client";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../lib/errors";
import type { Role } from "../lib/token";
import { approvalRepository } from "../repository/approvalRepository";
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
  actorRole: Role;
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function toTrailAction(action: approvalActionRequestSchemaType["action"]) {
  const mapped: Record<
    approvalActionRequestSchemaType["action"],
    ApprovalTrailAction
  > = {
    approve: "approved",
    reject: "rejected",
    sent_back: "require_more_info",
    cancel: "cancelled",
  };

  return mapped[action];
}

function isPrivilegedApprovalReader(actorRole: Role) {
  return (
    actorRole === "super-admin" ||
    actorRole === "owner" ||
    actorRole === "back_office"
  );
}

function canSubmitForApproval(status: string) {
  return status === "draft";
}

async function assertCanReadRequest(
  request: NonNullable<ApprovalRequestRow>,
  actor: ActorContext,
) {
  if (isPrivilegedApprovalReader(actor.actorRole)) {
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
      if (!roleName) {
        throw new BadRequestError("Approval chain role is missing");
      }

      const activeCount =
        await approvalRepository.countActiveEmployeesByRoleName(roleName);
      if (activeCount === 0) {
        throw new BadRequestError(
          `No active employees found for role ${roleName}`,
        );
      }
      continue;
    }

    const employeeId = step.employeeId;
    if (!employeeId) {
      throw new BadRequestError("Approval chain specific approver is missing");
    }

    const approver =
      await approvalRepository.findEmployeeWithRoleById(employeeId);
    if (!approver?.isActive) {
      throw new BadRequestError(
        `Specific approver ${employeeId} is missing or inactive`,
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
      isSaleOrderLinked: input.isSaleOrderLinked ?? null,
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
        throw new ConflictError(
          "Active policy with same priority and docType already exists",
        );
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
      ...(input.isSaleOrderLinked !== undefined
        ? { isSaleOrderLinked: input.isSaleOrderLinked }
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
        throw new ConflictError(
          "Active policy with same priority and docType already exists",
        );
      }
      throw error;
    }
  },

  async submitRequest(input: submitApprovalRequestSchemaType, actorId: number) {
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

    if (!canSubmitForApproval(doc.status)) {
      throw new ConflictError(
        `Cannot submit ${input.docType.toUpperCase()} for approval from status ${doc.status}`,
        "APPROVAL_INVALID_SOURCE_STATUS",
      );
    }

    let policy = await approvalRepository.findMatchingActivePolicy({
      docType: input.docType,
      subDocType: doc.subDocType,
      isSaleOrderLinked: doc.isSaleOrderLinked,
      amountPaise: doc.amountPaise,
    });

    if (!policy) {
      policy = await approvalRepository.findOrCreateFallbackPolicy(
        input.docType,
        actorId,
      );
    }

    if (!policy) {
      throw new BadRequestError("Unable to resolve approval policy");
    }

    const chain = policy.approvalChain;
    await assertChainHasEligibleApprovers(chain);

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

      const autoApproved = policy.autoApprove === true;
      const now = new Date();

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
            notes: "Auto-approved by policy",
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
            approvedBy: autoApproved ? actorId : null,
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
            approvedBy: autoApproved ? actorId : null,
          },
          tx,
        );
      }

      if (input.docType === "sco" && autoApproved) {
        await approvalRepository.updateScoApprovalMirror(
          input.docId,
          { status: "approved" },
          tx,
        );
      } else if (input.docType === "sco") {
        await approvalRepository.updateScoApprovalMirror(
          input.docId,
          { status: "pending_approval" },
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
    return db.transaction(async (tx) => {
      await approvalRepository.lockRequestById(requestId, tx);

      const request = await approvalRepository.findRequestById(requestId, tx);
      if (!request) {
        throw new NotFoundError("Approval request not found");
      }

      if (request.status !== "pending_approval") {
        throw new BadRequestError("Approval request is not pending");
      }

      const chain = request.chainSnapshot;
      if (input.action === "cancel") {
        if (request.requestedBy !== actorId) {
          throw new ForbiddenError("Only requester can cancel this approval");
        }
      } else {
        await assertEligibleActorForCurrentStep(
          chain,
          request.currentLevel,
          actorId,
        );
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

      if (input.action === "cancel") {
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
          notes: input.notes ?? null,
        },
        tx,
      );

      if (request.docType === "pr") {
        const prStatus =
          nextStatus === "approved" ||
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
        const poStatus =
          nextStatus === "approved"
            ? "approved"
            : nextStatus === "rejected"
              ? "cancelled"
              : nextStatus === "require_more_info"
                ? "draft"
                : nextStatus === "cancelled"
                  ? "cancelled"
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
      }

      if (request.docType === "sco") {
        if (nextStatus === "approved") {
          await approvalRepository.updateScoApprovalMirror(
            request.docId,
            { status: "approved" },
            tx,
          );
        }

        if (nextStatus === "rejected") {
          await approvalRepository.updateScoApprovalMirror(
            request.docId,
            { status: "rejected" },
            tx,
          );
        }

        if (nextStatus === "require_more_info") {
          await approvalRepository.updateScoApprovalMirror(
            request.docId,
            { status: "require_more_info" },
            tx,
          );
        }

        if (nextStatus === "cancelled") {
          await approvalRepository.updateScoApprovalMirror(
            request.docId,
            { status: "cancelled" },
            tx,
          );
        }
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
      actor.actorRole !== "super-admin"
    ) {
      throw new ForbiddenError(
        "Only super-admin can fetch another employee approvals",
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
};
