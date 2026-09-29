import type { Context } from "hono";

import { AppError, BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { assetService } from "../service/assetService";
import {
  assetInventoryMovementListQuerySchema,
  assetItemCreateSchema,
  assetItemListQuerySchema,
  assetItemUpdateSchema,
  assetLastRateQuerySchema,
  assetLocationCreateSchema,
  assetLocationListQuerySchema,
  assetLocationUpdateSchema,
  assetMachineCreateSchema,
  assetMachineListQuerySchema,
  assetMachineUpdateSchema,
  assetReconciliationQuerySchema,
  assetServiceCreateSchema,
  assetServiceListQuerySchema,
  assetServiceUpdateSchema,
} from "../types/asset.types";

function parseId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return id;
}

export const assetController = {
  async listItems(c: Context<AppEnv>) {
    const query = assetItemListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await assetService.listItems(query);
    return c.json({ success: true, data, meta });
  },

  async createItem(c: Context<AppEnv>) {
    const body = assetItemCreateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await assetService.createItem(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async updateItem(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "item id");
    const body = assetItemUpdateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await assetService.updateItem(id, body, actorId);
    return c.json({ success: true, data });
  },

  async getLastRate(c: Context<AppEnv>) {
    const itemId = parseId(c.req.param("itemId"), "item id");
    const query = assetLastRateQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const data = await assetService.getLastRate(itemId, query);
    return c.json({ success: true, data });
  },

  async listServices(c: Context<AppEnv>) {
    const query = assetServiceListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await assetService.listServices(query);
    return c.json({ success: true, data, meta });
  },

  async createService(c: Context<AppEnv>) {
    const body = assetServiceCreateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await assetService.createService(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async updateService(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "service id");
    const body = assetServiceUpdateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await assetService.updateService(id, body, actorId);
    return c.json({ success: true, data });
  },

  async listInventoryMovements(c: Context<AppEnv>) {
    const query = assetInventoryMovementListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await assetService.listInventoryMovements(query);
    return c.json({ success: true, data, meta });
  },

  // Contract step (m1-stock part 2): new body shape, logic lands in slice S9.
  async createInventoryMovement(_c: Context<AppEnv>): Promise<never> {
    throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
  },

  // Slice S9 (BR-INV-19).
  async inventoryStock(_c: Context<AppEnv>): Promise<never> {
    throw new AppError("Not implemented", 501, "NOT_IMPLEMENTED");
  },

  async inventoryReconciliation(c: Context<AppEnv>) {
    const query = assetReconciliationQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await assetService.inventoryReconciliation(query);
    return c.json({ success: true, data, meta });
  },

  async listLocations(c: Context<AppEnv>) {
    const query = assetLocationListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await assetService.listLocations(query);
    return c.json({ success: true, data, meta });
  },

  async createLocation(c: Context<AppEnv>) {
    const body = assetLocationCreateSchema.parse(await c.req.json());
    const data = await assetService.createLocation(body);
    return c.json({ success: true, data }, 201);
  },

  async updateLocation(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "location id");
    const body = assetLocationUpdateSchema.parse(await c.req.json());
    const data = await assetService.updateLocation(id, body);
    return c.json({ success: true, data });
  },

  async listMachines(c: Context<AppEnv>) {
    const query = assetMachineListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await assetService.listMachines(query);
    return c.json({ success: true, data, meta });
  },

  async createMachine(c: Context<AppEnv>) {
    const body = assetMachineCreateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await assetService.createMachine(body, actorId);
    return c.json({ success: true, data }, 201);
  },

  async updateMachine(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "machine id");
    const body = assetMachineUpdateSchema.parse(await c.req.json());
    const actorId = Number(c.get("user").userId);
    const data = await assetService.updateMachine(id, body, actorId);
    return c.json({ success: true, data });
  },
};
