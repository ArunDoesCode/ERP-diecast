import { create } from "zustand";
import type { Employee, Page, Role } from "@/types/setup";

type SetupEntity = "employee" | "role" | "page";

type SetupDrawerState =
  | { open: false }
  | { open: true; entity: "employee"; mode: "create" }
  | { open: true; entity: "employee"; mode: "edit"; data: Employee }
  | { open: true; entity: "role"; mode: "create" }
  | { open: true; entity: "role"; mode: "edit"; data: Role }
  | { open: true; entity: "page"; mode: "create" }
  | { open: true; entity: "page"; mode: "edit"; data: Page };

type SetupDrawerStore = {
  drawer: SetupDrawerState;
  openCreate: (entity: SetupEntity) => void;
  openEdit: (entity: SetupEntity, data: Employee | Role | Page) => void;
  close: () => void;
};

export const useSetupDrawerStore = create<SetupDrawerStore>((set) => ({
  drawer: { open: false },
  openCreate: (entity) =>
    set({
      drawer: { open: true, entity, mode: "create" } as SetupDrawerState,
    }),
  openEdit: (entity, data) =>
    set({
      drawer: { open: true, entity, mode: "edit", data } as SetupDrawerState,
    }),
  close: () => set({ drawer: { open: false } }),
}));
