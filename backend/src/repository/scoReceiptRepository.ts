// S3 stub (contract step): queries land with the implement step (BR-SCO-12..18, 22, 24, 25).
import { NotImplementedError } from "../lib/errors";

export const scoReceiptRepository = {
  async findById(_receiptId: number): Promise<never> {
    throw new NotImplementedError();
  },
  async listBySco(_scoId: number): Promise<never> {
    throw new NotImplementedError();
  },
};
