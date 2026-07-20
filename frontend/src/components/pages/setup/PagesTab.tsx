"use client";

import { PageTable } from "@/components/pages/setup/PageTable";
import { Button } from "@/components/ui/button";
import type { Page } from "@/types/setup";

type PagesTabProps = {
  onCreatePage: () => void;
  onEditPage: (page: Page) => void;
};

export function PagesTab({ onCreatePage, onEditPage }: PagesTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={onCreatePage}>+ New Page</Button>
      </div>

      <PageTable onEditPage={onEditPage} />
    </div>
  );
}
