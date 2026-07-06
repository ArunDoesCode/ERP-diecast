import { BadRequestError, NotFoundError } from "../lib/errors";
import { moduleRepository } from "../repository/moduleRepository";
import { pageRepository } from "../repository/pageRepository";
import type {
  pageInputSchemaType,
  pageListQuerySchemaType,
} from "../types/setup.types";

async function assertValidModuleId(moduleId: number | null) {
  if (moduleId === null) {
    return;
  }
  const module = await moduleRepository.findById(moduleId);
  if (!module) {
    throw new BadRequestError("Invalid moduleId");
  }
}

export const pageService = {
  async list(params: pageListQuerySchemaType) {
    const { rows, total } = await pageRepository.list(params);
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? Math.max(total, 1);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      data: rows,
      meta: { page, pageSize, total, totalPages },
    };
  },

  async create(input: pageInputSchemaType, actorId: number) {
    await assertValidModuleId(input.moduleId);
    return pageRepository.create({ ...input, createdBy: actorId });
  },

  async update(id: number, input: pageInputSchemaType) {
    await assertValidModuleId(input.moduleId);

    // key is immutable — strip it from the update payload even if sent
    const { label, path, sortOrder, moduleId } = input;

    const updated = await pageRepository.update(id, {
      label,
      path,
      sortOrder,
      moduleId,
    });
    if (!updated) {
      throw new NotFoundError("Page not found");
    }
    return updated;
  },

  async remove(id: number) {
    const existing = await pageRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("Page not found");
    }
    await pageRepository.remove(id);
  },
};
