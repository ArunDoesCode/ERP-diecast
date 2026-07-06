"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Module, Page } from "@/types/setup";

type ModulePagesPopoverProps = {
  module: Module;
  pages: Page[];
  grantedPageIds: Set<number>;
  onToggle: (pageId: number, checked: boolean) => void;
  readOnly?: boolean;
  children: React.ReactNode;
};

export function ModulePagesPopover({
  module,
  pages,
  grantedPageIds,
  onToggle,
  readOnly = false,
  children,
}: ModulePagesPopoverProps) {
  const modulePages = pages.filter((page) => page.moduleId === module.id);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="flex flex-col gap-2">
          <p className="font-medium">{module.name}</p>

          {modulePages.length === 0 ? (
            <p className="text-xs/relaxed text-muted-foreground">
              No pages in this module.
            </p>
          ) : (
            modulePages.map((page) => (
              <Label key={page.id} className="cursor-pointer font-normal">
                <Checkbox
                  checked={grantedPageIds.has(page.id)}
                  disabled={readOnly}
                  onCheckedChange={(checked) =>
                    onToggle(page.id, checked === true)
                  }
                />
                {page.label}
              </Label>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
