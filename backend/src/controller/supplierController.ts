import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { supplierService } from "../service/supplierService";
import {
  supplierCreateSchema,
  supplierHistoryQuerySchema,
  supplierItemBatchEditSchema,
  supplierItemCreateSchema,
  supplierItemListQuerySchema,
  supplierListQuerySchema,
  supplierServiceBatchEditSchema,
  supplierServiceCreateSchema,
  supplierServiceListQuerySchema,
  supplierUpdateSchema,
} from "../types/supplier.types";

function parseSupplierId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("Invalid supplier id");
  }
  return id;
}

export const supplierController = {
  async list(c: Context<AppEnv>) {
    const query = supplierListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await supplierService.list(query);
    return c.json({ success: true, data, meta });
  },

  async listItems(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const query = supplierItemListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await supplierService.listItems(supplierId, query);
    return c.json({ success: true, data, meta });
  },

  async listServices(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const query = supplierServiceListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await supplierService.listServices(
      supplierId,
      query,
    );
    return c.json({ success: true, data, meta });
  },

  // BR-SUP-10 — contract only, 501 until S12
  async history(c: Context<AppEnv>) {
    parseSupplierId(c.req.param("supplierId"));
    supplierHistoryQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    return c.json({ success: false, message: "Not implemented" }, 501);
  },

  async getDetails(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const data = await supplierService.getSupplierDetails(supplierId);
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = supplierCreateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await supplierService.create(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const id = parseSupplierId(c.req.param("id"));
    const body = supplierUpdateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await supplierService.update(id, body, actorId);
    return c.json({ success: true, data });
  },

  async createItem(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const body = supplierItemCreateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await supplierService.createSupplierItem(
      supplierId,
      body,
      actorId,
    );
    return c.json({ success: true, data }, 201);
  },

  async editItem(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const body = supplierItemBatchEditSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await supplierService.editSupplierItems(
      supplierId,
      body,
      actorId,
    );
    return c.json({ success: true, ...data });
  },

  async createService(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const body = supplierServiceCreateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await supplierService.createSupplierService(
      supplierId,
      body,
      actorId,
    );
    return c.json({ success: true, data }, 201);
  },

  async editService(c: Context<AppEnv>) {
    const supplierId = parseSupplierId(c.req.param("supplierId"));
    const body = supplierServiceBatchEditSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await supplierService.editSupplierServices(
      supplierId,
      body,
      actorId,
    );
    return c.json({ success: true, ...data });
  },
};
