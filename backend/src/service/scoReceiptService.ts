// S3 stub (contract step): logic lands with the implement step (BR-SCO-12..18, 22, 24, 25).
import type { Actor } from "../lib/auth-middleware";
import { NotImplementedError } from "../lib/errors";
import type {
  createReceiptSchemaType,
  qaDecisionSchemaType,
  receiptDetailsSchemaType,
  receiptResponseSchemaType,
} from "../types/scoReceipt.types";

export const scoReceiptService = {
  async create(
    _scoId: number,
    _input: createReceiptSchemaType,
    _actorId: number,
    _actor: Actor,
  ): Promise<receiptDetailsSchemaType> {
    throw new NotImplementedError();
  },

  async decideQa(
    _receiptId: number,
    _lineId: number,
    _input: qaDecisionSchemaType,
    _actorId: number,
    _actor: Actor,
  ): Promise<receiptDetailsSchemaType> {
    throw new NotImplementedError();
  },

  async listBySco(_scoId: number): Promise<receiptResponseSchemaType[]> {
    throw new NotImplementedError();
  },

  async getDetails(_receiptId: number): Promise<receiptDetailsSchemaType> {
    throw new NotImplementedError();
  },
};
