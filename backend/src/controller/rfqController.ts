import type { Context } from "hono";

import { BadRequestError } from "../lib/errors";
import type { AppEnv } from "../lib/types";
import { rfqService } from "../service/rfqService";
import {
  awardSchema,
  createQuoteSchema,
  createRfqSchema,
  prLinesQuerySchema,
  rfqEmptyBodySchema,
  rfqListQuerySchema,
  rfqReasonBodySchema,
  updateQuoteSchema,
  updateRfqSchema,
} from "../types/rfq.types";

const queryOf = (c: Context<AppEnv>) =>
  Object.fromEntries(new URL(c.req.url).searchParams);

function parseId(value: unknown, label: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new BadRequestError(`Invalid ${label}`);
  }
  return id;
}

// An empty body counts as {} for the action routes that take no payload.
async function readBody(c: Context<AppEnv>) {
  const text = await c.req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("Request body is not valid JSON", "INVALID_JSON");
  }
}

export const rfqController = {
  async prLines(c: Context<AppEnv>) {
    const { data, meta } = await rfqService.prLines(
      prLinesQuerySchema.parse(queryOf(c)),
    );
    return c.json({ success: true, data, meta });
  },

  async list(c: Context<AppEnv>) {
    const { data, meta } = await rfqService.list(
      rfqListQuerySchema.parse(queryOf(c)),
    );
    return c.json({ success: true, data, meta });
  },

  async details(c: Context<AppEnv>) {
    const data = await rfqService.details(
      parseId(c.req.param("id"), "RFQ id"),
      c.get("actor"),
    );
    return c.json({ success: true, data });
  },

  async create(c: Context<AppEnv>) {
    const body = createRfqSchema.parse(await c.req.json());
    const data = await rfqService.create(body, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },

  async update(c: Context<AppEnv>) {
    const body = updateRfqSchema.parse(await c.req.json());
    const data = await rfqService.update(body, c.get("actor"));
    return c.json({ success: true, data });
  },

  async send(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "RFQ id");
    rfqEmptyBodySchema.parse(await readBody(c));
    const data = await rfqService.send(id, c.get("actor"));
    return c.json({ success: true, data });
  },

  async cancel(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "RFQ id");
    const body = rfqReasonBodySchema.parse(await readBody(c));
    const data = await rfqService.cancel(id, body.reason, c.get("actor"));
    return c.json({ success: true, data });
  },

  async close(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "RFQ id");
    const body = rfqReasonBodySchema.parse(await readBody(c));
    const data = await rfqService.close(id, body.reason, c.get("actor"));
    return c.json({ success: true, data });
  },

  async print(c: Context<AppEnv>) {
    const data = await rfqService.print(parseId(c.req.param("id"), "RFQ id"));
    return c.json({ success: true, data });
  },

  async quoteDetails(c: Context<AppEnv>) {
    const data = await rfqService.quoteDetails(
      parseId(c.req.param("quoteId"), "quote id"),
    );
    return c.json({ success: true, data });
  },

  async createQuote(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "RFQ id");
    const body = createQuoteSchema.parse(await c.req.json());
    const data = await rfqService.createQuote(id, body, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },

  async updateQuote(c: Context<AppEnv>) {
    const id = parseId(c.req.param("quoteId"), "quote id");
    const body = updateQuoteSchema.parse(await c.req.json());
    const data = await rfqService.updateQuote(id, body, c.get("actor"));
    return c.json({ success: true, data });
  },

  async submitQuote(c: Context<AppEnv>) {
    const id = parseId(c.req.param("quoteId"), "quote id");
    rfqEmptyBodySchema.parse(await readBody(c));
    const data = await rfqService.submitQuote(id, c.get("actor"));
    return c.json({ success: true, data });
  },

  async cancelQuote(c: Context<AppEnv>) {
    const id = parseId(c.req.param("quoteId"), "quote id");
    const body = rfqReasonBodySchema.parse(await readBody(c));
    const data = await rfqService.cancelQuote(id, body.reason, c.get("actor"));
    return c.json({ success: true, data });
  },

  async comparison(c: Context<AppEnv>) {
    const data = await rfqService.comparison(
      parseId(c.req.param("id"), "RFQ id"),
      c.get("actor"),
    );
    return c.json({ success: true, data });
  },

  async award(c: Context<AppEnv>) {
    const id = parseId(c.req.param("id"), "RFQ id");
    const body = awardSchema.parse(await c.req.json());
    const data = await rfqService.award(id, body, c.get("actor"));
    return c.json({ success: true, data }, 201);
  },
};
