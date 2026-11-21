import type { Context } from "hono";

import { BadRequestError, UnauthorizedError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { supplierInvoiceService } from "../service/supplierInvoiceService";
import {
  billableLinesQuerySchema,
  cancelSupplierInvoiceSchema,
  createSupplierInvoiceSchema,
  releaseSupplierInvoiceSchema,
  supplierInvoiceEmptyBodySchema,
  supplierInvoiceListQuerySchema,
  updateSupplierInvoiceSchema,
} from "../types/supplierInvoice.types";

function parseActorId(c: Context<AppEnv>) {
  const actorId = Number(c.get("user").userId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new UnauthorizedError("Invalid user session");
  }
  return actorId;
}

function parseId(c: Context<AppEnv>) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("Invalid supplier invoice id");
  }
  return id;
}

const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

// An absent body on an action route counts as `{}`; anything else must parse.
async function jsonOrEmpty(c: Context<AppEnv>) {
  const text = await c.req.text();
  return text.trim() === "" ? {} : JSON.parse(text);
}

export const supplierInvoiceController = {
  async list(c: Context<AppEnv>) {
    const query = supplierInvoiceListQuerySchema.parse(queryOf(c));
    const { data, meta } = await supplierInvoiceService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await supplierInvoiceService.getDetails(parseId(c));
    return c.json({ success: true, data });
  },

  async billableLines(c: Context<AppEnv>) {
    const query = billableLinesQuerySchema.parse(queryOf(c));
    const data = await supplierInvoiceService.billableLines(query);
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createSupplierInvoiceSchema.parse(await c.req.json());
    const data = await supplierInvoiceService.create(body, parseActorId(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updateSupplierInvoiceSchema.parse(await c.req.json());
    const data = await supplierInvoiceService.update(body, parseActorId(c));
    return c.json({ success: true, data });
  },

  async remove(c: Context<AppEnv>) {
    const data = await supplierInvoiceService.remove(
      parseId(c),
      parseActorId(c),
    );
    return c.json({ success: true, data });
  },

  async submit(c: Context<AppEnv>) {
    supplierInvoiceEmptyBodySchema.parse(await jsonOrEmpty(c));
    const data = await supplierInvoiceService.submit(
      parseId(c),
      parseActorId(c),
    );
    return c.json({ success: true, data });
  },

  async backToDraft(c: Context<AppEnv>) {
    supplierInvoiceEmptyBodySchema.parse(await jsonOrEmpty(c));
    const data = await supplierInvoiceService.backToDraft(
      parseId(c),
      parseActorId(c),
    );
    return c.json({ success: true, data });
  },

  async release(c: Context<AppEnv>) {
    const body = releaseSupplierInvoiceSchema.parse(await c.req.json());
    const data = await supplierInvoiceService.release(
      parseId(c),
      body,
      parseActorId(c),
    );
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const body = cancelSupplierInvoiceSchema.parse(await c.req.json());
    const data = await supplierInvoiceService.cancel(
      parseId(c),
      body,
      parseActorId(c),
    );
    return c.json({ success: true, data });
  },
};
