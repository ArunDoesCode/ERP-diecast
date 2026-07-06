"use client";

import { EmployeeTable } from "@/components/pages/setup/EmployeeTable";
import { Button } from "@/components/ui/button";
import { useSetupDrawerStore } from "@/lib/store/setupDrawerStore";

export function EmployeesTab() {
	const openCreate = useSetupDrawerStore((state) => state.openCreate);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-end">
				<Button onClick={() => openCreate("employee")}>+ New Employee</Button>
			</div>

			<EmployeeTable />
		</div>
	);
}
