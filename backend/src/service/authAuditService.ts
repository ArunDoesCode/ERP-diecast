import { authAuditRepository } from "../repository/authAuditRepository";
import type { accessLogListQuerySchemaType } from "../types/setup.types";

export const authAuditService = {
  /** Read-only access log (BR-AUTH-20). There is no write path other than the setup services' own inserts. */
  async list(params: accessLogListQuerySchemaType) {
    const { rows, total } = await authAuditRepository.list(params);
    return {
      data: rows.map((row) => ({ ...row, at: row.at.toISOString() })),
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
      },
    };
  },
};
