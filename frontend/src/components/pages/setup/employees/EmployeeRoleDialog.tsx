"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	useAssignableRolesQuery,
	useAssignEmployeeRoleMutation,
} from "@/lib/api/setup/queries";
import type { Employee } from "@/types/setup";

type EmployeeRoleDialogProps = {
	employee: Employee | null;
	onClose: () => void;
};

export function EmployeeRoleDialog({
	employee,
	onClose,
}: EmployeeRoleDialogProps) {
	return (
		<Dialog
			open={employee !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Change role: {employee?.name}</DialogTitle>
				</DialogHeader>
				{employee && (
					<RoleSelect key={employee.id} employee={employee} onDone={onClose} />
				)}
			</DialogContent>
		</Dialog>
	);
}

function RoleSelect({
	employee,
	onDone,
}: {
	employee: Employee;
	onDone: () => void;
}) {
	const rolesQuery = useAssignableRolesQuery();
	const mutation = useAssignEmployeeRoleMutation();
	const [roleId, setRoleId] = useState(employee.roleId);

	return (
		<div className="flex flex-col gap-3">
			<Label htmlFor="employee-role">Role</Label>
			<Select
				value={String(roleId)}
				onValueChange={(value) => setRoleId(Number(value))}
			>
				<SelectTrigger id="employee-role" className="w-full">
					<SelectValue placeholder="Select role" />
				</SelectTrigger>
				<SelectContent>
					{(rolesQuery.data?.data ?? []).map((role) => (
						<SelectItem key={role.id} value={String(role.id)}>
							{role.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				disabled={roleId === employee.roleId || mutation.isPending}
				onClick={() =>
					mutation.mutate({ id: employee.id, roleId }, { onSuccess: onDone })
				}
			>
				{mutation.isPending ? "Saving..." : "Save"}
			</Button>
		</div>
	);
}
