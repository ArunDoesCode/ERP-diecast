"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  useCreateRoleMutation,
  useUpdateRoleMutation,
} from "@/lib/api/setup/queries";
import { type RoleInput, roleSchema } from "@/types/setup";

type RoleFormProps = {
  mode: "create" | "edit";
  defaultValues?: RoleInput;
  roleId?: number;
  isSystem?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onDone: () => void;
};

export function RoleForm({
  mode,
  defaultValues,
  roleId,
  isSystem,
  onDirtyChange,
  onDone,
}: RoleFormProps) {
  const createRoleMutation = useCreateRoleMutation();
  const updateRoleMutation = useUpdateRoleMutation();

  const isPending =
    mode === "create"
      ? createRoleMutation.isPending
      : updateRoleMutation.isPending;

  const form = useForm<RoleInput>({
    resolver: zodResolver(roleSchema),
    defaultValues: defaultValues ?? { name: "" },
  });

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  function onSubmit(values: RoleInput) {
    if (mode === "create") {
      createRoleMutation.mutate(values, { onSuccess: onDone });
      return;
    }

    if (!roleId) return;
    updateRoleMutation.mutate(
      { id: roleId, input: values },
      { onSuccess: onDone },
    );
  }

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput
                  {...field}
                  id="name"
                  label="Name"
                  disabled={isSystem}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isSystem && (
          <p className="text-xs/relaxed text-muted-foreground">
            Protected by system. Core roles cannot be renamed.
          </p>
        )}

        <Button className="w-full" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </form>
    </Form>
  );
}
