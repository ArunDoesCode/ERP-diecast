"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type Resolver } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreatePageMutation,
  useModulesQuery,
  useUpdatePageMutation,
} from "@/lib/api/setup/queries";
import { type PageInput, pageSchema } from "@/types/setup";

const NO_MODULE_VALUE = "none";

type PageFormProps = {
  mode: "create" | "edit";
  defaultValues?: PageInput;
  pageId?: number;
  onDirtyChange?: (dirty: boolean) => void;
  onDone: () => void;
};

export function PageForm({
  mode,
  defaultValues,
  pageId,
  onDirtyChange,
  onDone,
}: PageFormProps) {
  const modulesQuery = useModulesQuery();
  const createPageMutation = useCreatePageMutation();
  const updatePageMutation = useUpdatePageMutation();

  const modules = modulesQuery.data?.data ?? [];
  const isPending =
    mode === "create"
      ? createPageMutation.isPending
      : updatePageMutation.isPending;

  const form = useForm<PageInput>({
    // ponytail: pageSchema uses z.coerce fields, so zodResolver's inferred
    // input type diverges from PageInput (z.output) — cast is the documented
    // workaround for zod4 + @hookform/resolvers coerced schemas
    resolver: zodResolver(pageSchema) as unknown as Resolver<PageInput>,
    defaultValues: defaultValues ?? {
      key: "",
      label: "",
      path: "",
      sortOrder: 0,
      moduleId: null,
    },
  });

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty);
  }, [form.formState.isDirty, onDirtyChange]);

  function onSubmit(values: PageInput) {
    if (mode === "create") {
      createPageMutation.mutate(values, { onSuccess: onDone });
      return;
    }

    if (!pageId) return;
    updatePageMutation.mutate(
      { id: pageId, input: values },
      { onSuccess: onDone },
    );
  }

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="key"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput
                  {...field}
                  id="key"
                  label="Key"
                  disabled={mode === "edit"}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="label"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput {...field} id="label" label="Label" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="path"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput {...field} id="path" label="Path" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="sortOrder"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormControl>
                <FloatingLabelInput
                  id="sortOrder"
                  label="Sort Order"
                  type="number"
                  name={field.name}
                  value={field.value}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  onChange={(event) =>
                    field.onChange(event.target.valueAsNumber)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="moduleId"
          render={({ field }) => (
            <FormItem className="min-h-19">
              <FormLabel>Module</FormLabel>
              <Select
                value={field.value ? String(field.value) : NO_MODULE_VALUE}
                onValueChange={(value) =>
                  field.onChange(
                    value === NO_MODULE_VALUE ? null : Number(value),
                  )
                }
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select module" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_MODULE_VALUE}>None</SelectItem>
                  {modules.map((module) => (
                    <SelectItem key={module.id} value={String(module.id)}>
                      {module.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="w-full" type="submit" disabled={isPending}>
          {isPending ? "Saving..." : "Save"}
        </Button>
      </form>
    </Form>
  );
}
