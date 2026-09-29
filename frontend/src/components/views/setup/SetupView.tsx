"use client";

import Link from "next/link";
import { useQueryState } from "nuqs";
import { useState } from "react";
import { AccessLogTab } from "@/components/pages/setup/access-log/AccessLogTab";
import { EmployeesTab } from "@/components/pages/setup/employees/EmployeesTab";
import { RolesTab } from "@/components/pages/setup/roles/RolesTab";
import { ScreensTab } from "@/components/pages/setup/screens/ScreensTab";
import {
	SetupDialog,
	type SetupModalState,
} from "@/components/pages/setup/shared/SetupDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/hooks/use-can";
import type { Employee, Role } from "@/types/setup";

type SetupEntity = "employee" | "role";

const SetupView = () => {
	const canManageRoles = useCan("setup.roles.manage");
	const canManageEmployees = useCan("setup.employees.manage");
	const allowedTabs = [
		...(canManageEmployees ? ["employees"] : []),
		...(canManageRoles ? ["roles", "screens", "access-log"] : []),
	];
	const defaultTab = allowedTabs[0] ?? "";
	const [rawTab, setTab] = useQueryState("tab", { defaultValue: defaultTab });
	const tab = allowedTabs.includes(rawTab) ? rawTab : defaultTab;
	const [modal, setModal] = useState<SetupModalState>({ open: false });

	function openCreate(entity: SetupEntity) {
		setModal({ open: true, entity, mode: "create" });
	}

	function openEditEmployee(employee: Employee) {
		setModal({ open: true, entity: "employee", mode: "edit", data: employee });
	}

	function openEditRole(role: Role) {
		setModal({ open: true, entity: "role", mode: "edit", data: role });
	}

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h1 className="text-lg font-semibold">Setup</h1>
				</div>
				<Button asChild variant="outline">
					<Link href="/setup/approval">Approval Policies</Link>
				</Button>
			</div>

			<Tabs value={tab} onValueChange={setTab}>
				<TabsList>
					{canManageEmployees && (
						<TabsTrigger value="employees">Employees</TabsTrigger>
					)}
					{canManageRoles && <TabsTrigger value="roles">Roles</TabsTrigger>}
					{canManageRoles && <TabsTrigger value="screens">Screens</TabsTrigger>}
					{canManageRoles && (
						<TabsTrigger value="access-log">Access log</TabsTrigger>
					)}
				</TabsList>
				{canManageEmployees && (
					<TabsContent value="employees">
						<EmployeesTab
							onCreateEmployee={() => openCreate("employee")}
							onEditEmployee={openEditEmployee}
						/>
					</TabsContent>
				)}
				{canManageRoles && (
					<TabsContent value="roles">
						<RolesTab
							onCreateRole={() => openCreate("role")}
							onEditRole={openEditRole}
						/>
					</TabsContent>
				)}
				{canManageRoles && (
					<TabsContent value="screens">
						<ScreensTab />
					</TabsContent>
				)}
				{canManageRoles && (
					<TabsContent value="access-log">
						<AccessLogTab />
					</TabsContent>
				)}
			</Tabs>
			<SetupDialog modal={modal} onClose={() => setModal({ open: false })} />
		</div>
	);
};

export default SetupView;
