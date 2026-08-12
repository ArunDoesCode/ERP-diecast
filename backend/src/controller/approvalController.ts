import type { Context } from "hono";

import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { approvalService } from "../service/approvalService";
import {
  approvalActionRequestSchema,
  approvalDocLookupParamSchema,
  approvalPolicyIdParamSchema,
  approvalPolicyListQuerySchema,
  approvalRequestIdParamSchema,
  createApprovalPolicySchema,
  myPendingApprovalsQuerySchema,
  submitApprovalRequestSchema,
  updateApprovalPolicySchema,
} from "../types/approval.types";

function parseActor(c: Context<AppEnv>) {
  const user = c.get("user");
  const actorId = Number(user.userId);

  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }

  return {
    actorId,
    actorRole: user.role,
  };
}

export const approvalController = {
  async getPolicies(c: Context<AppEnv>) {
    const query = approvalPolicyListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );

    const { data, meta } = await approvalService.getPolicies(query);
    return c.json({ success: true, data, meta });
  },

  async getPolicyDetails(c: Context<AppEnv>) {
    const params = approvalPolicyIdParamSchema.parse({ id: c.req.param("id") });
    const data = await approvalService.getPolicyDetails(params);
    return c.json({ success: true, data });
  },

  async createPolicy(c: Context<AppEnv>) {
    const body = createApprovalPolicySchema.parse(await c.req.json());
    const { actorId } = parseActor(c);

    const data = await approvalService.createPolicy(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async updatePolicy(c: Context<AppEnv>) {
    const params = approvalPolicyIdParamSchema.parse({ id: c.req.param("id") });
    const body = updateApprovalPolicySchema.parse(await c.req.json());
    const { actorId } = parseActor(c);

    const data = await approvalService.updatePolicy(params.id, body, actorId);
    return c.json({ success: true, data });
  },

  async submitRequest(c: Context<AppEnv>) {
    const body = submitApprovalRequestSchema.parse(await c.req.json());
    const { actorId } = parseActor(c);

    const data = await approvalService.submitRequest(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async getRequestDetails(c: Context<AppEnv>) {
    const params = approvalRequestIdParamSchema.parse({
      id: c.req.param("id"),
    });
    const actor = parseActor(c);
    const data = await approvalService.getRequestDetails(params, actor);
    return c.json({ success: true, data });
  },

  async getRequestTrail(c: Context<AppEnv>) {
    const params = approvalRequestIdParamSchema.parse({
      id: c.req.param("id"),
    });
    const actor = parseActor(c);
    const data = await approvalService.getRequestTrail(params, actor);
    return c.json({ success: true, data });
  },

  async actOnRequest(c: Context<AppEnv>) {
    const params = approvalRequestIdParamSchema.parse({
      id: c.req.param("id"),
    });
    const body = approvalActionRequestSchema.parse(await c.req.json());
    const { actorId } = parseActor(c);

    const data = await approvalService.actOnRequest(params.id, body, actorId);
    return c.json({ success: true, data });
  },

  async getMyPendingApprovals(c: Context<AppEnv>) {
    const query = myPendingApprovalsQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const actor = parseActor(c);

    const { data, meta } = await approvalService.getMyPendingApprovals(
      query,
      actor,
    );
    return c.json({ success: true, data, meta });
  },

  async getCurrentApprovalByDoc(c: Context<AppEnv>) {
    const params = approvalDocLookupParamSchema.parse({
      docType: c.req.param("docType"),
      docId: c.req.param("docId"),
    });

    const actor = parseActor(c);
    const data = await approvalService.getCurrentApprovalByDoc(params, actor);
    return c.json({ success: true, data });
  },
};
