import { moduleRepository } from "../repository/moduleRepository";

export const moduleService = {
  async list() {
    return moduleRepository.list();
  },
};
