"use client";

import { EmployeeTable } from "@/components/pages/setup/EmployeeTable";
import { Button } from "@/components/ui/button";
import type { Employee } from "@/types/setup";

type EmployeesTabProps = {
  onCreateEmployee: () => void;
  onEditEmployee: (employee: Employee) => void;
};

export function EmployeesTab({
  onCreateEmployee,
  onEditEmployee,
}: EmployeesTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={onCreateEmployee}>+ New Employee</Button>
      </div>

      <EmployeeTable onEditEmployee={onEditEmployee} />
    </div>
  );
}
