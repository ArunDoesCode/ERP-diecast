import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { rateContractService } from "../service/rateContractService";
import {
  contractEmptyBodySchema,
  contractListQuerySchema,
  contractReasonBodySchema,
  createContractSchema,
  terminateContractSchema,
  updateContractSchema,
} from "../types/rateContract.types";

const actorIdOf = (c: Context<AppEnv>) => c.get("actor").id;

function parseId(value: unknown) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError("Invalid rate contract id");
  }
  return id;
}

export const rateContractController = {
  async list(c: Context<AppEnv>) {
    const query = contractListQuerySchema.parse(
      Object.fromEntries(new URL(c.req.url).searchParams),
    );
    const { data, meta } = await rateContractService.list(query);
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await rateContractService.getDetails(
      parseId(c.req.param("id")),
    );
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createContractSchema.parse(await c.req.json());
    const data = await rateContractService.create(body, actorIdOf(c));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updateContractSchema.parse(await c.req.json());
    const data = await rateContractService.update(body, actorIdOf(c));
    return c.json({ success: true, data });
  },

  async activate(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"));
    contractEmptyBodySchema.parse(await readBody(c));
    const data = await rateContractService.activate(id, actorIdOf(c));
    return c.json({ success: true, data });
  },

  async terminate(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"));
    const body = terminateContractSchema.parse(await readBody(c));
    const data = await rateContractService.terminate(id, body, actorIdOf(c));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"));
    const body = contractReasonBodySchema.parse(await readBody(c));
    const data = await rateContractService.cancel(
      id,
      body.reason,
      actorIdOf(c),
    );
    return c.json({ success: true, data });
  },
};

// An empty body is read as {} so `activate` works with no payload.
async function readBody(c: Context<AppEnv>) {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("Request body is not valid JSON", "INVALID_JSON");
  }
}
