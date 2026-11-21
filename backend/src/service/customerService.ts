import { db } from "../db/client";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError, BadRequestError, NotFoundError } from "../lib/errors";
import { customerRepository } from "../repository/customerRepository";
import { salesAuditRepository } from "../repository/salesAuditRepository";
import type {
  CreateCustomerInput,
  CustomerListQuery,
  UpdateCustomerInput,
} from "../types/customer.types";

const NAME_EXISTS = () =>
  new AppError(
    "A customer with this name already exists",
    409,
    "CUSTOMER_NAME_EXISTS",
  );

function toMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// BR-SO-01: GSTIN first two digits must equal the state code.
function assertGstinMatchesState(gstin: string | null, stateCode: string) {
  if (gstin && gstin.slice(0, 2) !== stateCode) {
    throw new BadRequestError("GSTIN must start with the state code");
  }
}

export const customerService = {
  async list(query: CustomerListQuery) {
    const { rows, total } = await customerRepository.list(query);
    return { data: rows, meta: toMeta(query.page, query.pageSize, total) };
  },

  async getDetails(id: number) {
    const row = await customerRepository.findById(id);
    if (!row)
      throw new NotFoundError("Customer not found", "CUSTOMER_NOT_FOUND");
    return row;
  },

  async create(input: CreateCustomerInput, actorId: number) {
    try {
      return await db.transaction(async (tx) => {
        const row = await customerRepository.insert(
          {
            name: input.name,
            stateCode: input.stateCode,
            address: input.address,
            gstin: input.gstin ?? null,
            createdBy: actorId,
          },
          tx,
        );
        if (!row) throw new BadRequestError("Customer was not saved");
        await salesAuditRepository.write(
          {
            actorId,
            action: "customer.create",
            targetType: "customer",
            targetId: row.id,
            after: {
              name: row.name,
              stateCode: row.stateCode,
              address: row.address,
              gstin: row.gstin,
            },
          },
          tx,
        );
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw NAME_EXISTS();
      throw error;
    }
  },

  async update(id: number, input: UpdateCustomerInput, actorId: number) {
    try {
      return await db.transaction(async (tx) => {
        const current = await customerRepository.findByIdForUpdate(id, tx);
        if (!current)
          throw new NotFoundError("Customer not found", "CUSTOMER_NOT_FOUND");

        const next = {
          name: input.name ?? current.name,
          stateCode: input.stateCode ?? current.stateCode,
          address: input.address ?? current.address,
          gstin: input.gstin !== undefined ? input.gstin : current.gstin,
          isActive: input.isActive ?? current.isActive,
        };
        // the schema checks a pair sent together; this covers one sent alone
        assertGstinMatchesState(next.gstin, next.stateCode);

        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        for (const key of [
          "name",
          "stateCode",
          "address",
          "gstin",
          "isActive",
        ] as const) {
          if (next[key] !== current[key]) {
            before[key] = current[key];
            after[key] = next[key];
          }
        }

        const row = await customerRepository.update(
          id,
          {
            ...next,
            lastUpdatedBy: actorId,
            lastUpdatedAt: new Date(),
          },
          tx,
        );
        if (!row)
          throw new NotFoundError("Customer not found", "CUSTOMER_NOT_FOUND");

        const activeChanged = "isActive" in after;
        const action = activeChanged
          ? next.isActive
            ? "customer.activate"
            : "customer.deactivate"
          : "customer.edit";
        await salesAuditRepository.write(
          {
            actorId,
            action,
            targetType: "customer",
            targetId: id,
            before,
            after,
          },
          tx,
        );
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw NAME_EXISTS();
      throw error;
    }
  },
};
