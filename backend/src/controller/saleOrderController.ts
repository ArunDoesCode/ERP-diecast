import type { Context } from "hono";
import { can } from "../lib/auth-middleware";
import { UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { saleDraftService } from "../service/saleDraftService";
import { saleExplosionService } from "../service/saleExplosionService";
import { saleOrderService } from "../service/saleOrderService";
import {
  createDraftsSchema,
  createSaleOrderSchema,
  explosionListQuerySchema,
  explosionRowsQuerySchema,
  runExplosionSchema,
  soAuditQuerySchema,
  soExplosionParamSchema,
  soIdParamSchema,
  soListQuerySchema,
  soReasonBodySchema,
  soVersionBodySchema,
  updateSaleOrderSchema,
} from "../types/saleOrder.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

const parseId = (c: Context<AppEnv>) => soIdParamSchema.parse(c.req.param()).id;
const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

export const saleOrderController = {
  async list(c: Context<AppEnv>) {
    const query = soListQuerySchema.parse(queryOf(c));
    const { data, meta } = await saleOrderService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await saleOrderService.getDetails(parseId(c));
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createSaleOrderSchema.parse(await c.req.json());
    const data = await saleOrderService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = updateSaleOrderSchema.parse(await c.req.json());
    const data = await saleOrderService.update(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async confirm(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soVersionBodySchema.parse(await c.req.json());
    const data = await saleOrderService.confirm(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async hold(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soReasonBodySchema.parse(await c.req.json());
    const data = await saleOrderService.hold(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async resume(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soVersionBodySchema.parse(await c.req.json());
    const data = await saleOrderService.resume(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async close(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soReasonBodySchema.parse(await c.req.json());
    const data = await saleOrderService.close(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c);
    const body = soReasonBodySchema.parse(await c.req.json());
    const data = await saleOrderService.cancel(id, body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async audit(c: Context<AppEnv>) {
    const id = parseId(c);
    const query = soAuditQuerySchema.parse(queryOf(c));
    const { data, meta } = await saleOrderService.listAudit(id, query);
    return c.json({ success: true, data, meta });
  },

  async runExplosion(c: Context<AppEnv>) {
    const id = parseId(c);
    runExplosionSchema.parse(await c.req.json().catch(() => ({})));
    const data = await saleExplosionService.run(id, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async listExplosions(c: Context<AppEnv>) {
    const id = parseId(c);
    const query = explosionListQuerySchema.parse(queryOf(c));
    const { data, meta } = await saleExplosionService.list(id, query);
    return c.json({ success: true, data, meta });
  },

  async explosionDetails(c: Context<AppEnv>) {
    const { id, eid } = soExplosionParamSchema.parse(c.req.param());
    const data = await saleExplosionService.details(id, eid);
    return c.json({ success: true, data });
  },

  async explosionRows(c: Context<AppEnv>) {
    const { id, eid } = soExplosionParamSchema.parse(c.req.param());
    const query = explosionRowsQuerySchema.parse(queryOf(c));
    // BR-SO-50: job-worker candidate names only for so.explode holders
    const canSeeCandidates = can(c.get("actor"), "so.explode");
    const { data, meta } = await saleExplosionService.rows(
      id,
      eid,
      query,
      canSeeCandidates,
    );
    return c.json({ success: true, data, meta });
  },

  async createDrafts(c: Context<AppEnv>) {
    const { id, eid } = soExplosionParamSchema.parse(c.req.param());
    const body = createDraftsSchema.parse(await c.req.json());
    const data = await saleDraftService.createDrafts(
      id,
      eid,
      body,
      c.get("actor"),
    );
    return c.json({ success: true, data }, 201);
  },
};
