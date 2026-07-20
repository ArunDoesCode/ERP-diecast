"use client";

import {
  toSupplierCreatePayload,
  useCreateSupplierMutation,
} from "@/lib/api/suppliers/queries";
import type { SupplierMasterInput } from "@/types/suppliers";

import { SupplierMasterModal } from "./SupplierMasterModal";

type CreateSupplierModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function defaultValues(): SupplierMasterInput {
  return {
    name: "",
    type: undefined,
    gstNumber: "",
    panNumber: "",
    contactPerson: "",
    email: "",
    phone: "",
    address: "",
    defaultPaymentTermsDays: undefined,
    isActive: true,
  };
}

export function CreateSupplierModal({
  open,
  onOpenChange,
}: CreateSupplierModalProps) {
  const createMutation = useCreateSupplierMutation();

  return (
    <SupplierMasterModal
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      title="Create supplier"
      description="Add supplier master details only. Items and services are managed from the supplier detail page."
      submitLabel="Create supplier"
      defaultValues={defaultValues()}
      isSubmitting={createMutation.isPending}
      onSubmit={(values) => {
        createMutation.mutate(toSupplierCreatePayload(values), {
          onSuccess: (result) => {
            if (!result.success) return;
            onOpenChange(false);
          },
        });
      }}
    />
  );
}
