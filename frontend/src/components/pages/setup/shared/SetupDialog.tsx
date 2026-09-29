"use client";

import { useEffect, useState } from "react";

import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { EmployeeForm } from "@/components/pages/setup/employees/EmployeeForm";
import { RoleForm } from "@/components/pages/setup/roles/RoleForm";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import type { Employee, EmployeeInput, Role, RoleInput } from "@/types/setup";

export type SetupModalState =
	| { open: false }
	| { open: true; entity: "employee"; mode: "create" }
	| { open: true; entity: "employee"; mode: "edit"; data: Employee }
	| { open: true; entity: "role"; mode: "create" }
	| { open: true; entity: "role"; mode: "edit"; data: Role };

type SetupDialogProps = {
	modal: SetupModalState;
	onClose: () => void;
};

function toEmployeeInput(employee: Employee): EmployeeInput {
	return {
		name: employee.name,
		phone: employee.phone ?? "",
		dailyRatePaise: employee.dailyRatePaise,
		roleId: employee.roleId,
		loginMethod: employee.loginMethod,
		email: employee.email ?? "",
		password: "",
	};
}

function toRoleInput(role: Role): RoleInput {
	return { name: role.name };
}

const ENTITY_LABEL: Record<"employee" | "role", string> = {
	employee: "Employee",
	role: "Role",
};

export function SetupDialog({ modal, onClose }: SetupDialogProps) {
	const [isDirty, setIsDirty] = useState(false);
	const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

	useEffect(() => {
		if (modal.open) {
			setIsDirty(false);
		}
	}, [modal]);

	function closeSafely() {
		if (isDirty) {
			setConfirmDiscardOpen(true);
			return;
		}

		onClose();
	}

	return (
		<>
			<Dialog
				open={modal.open}
				onOpenChange={(open) => {
					if (open) return;
					closeSafely();
				}}
			>
				<DialogContent className="max-h-[85vh] sm:max-w-xl" showCloseButton>
					{modal.open && (
						<>
							<DialogHeader>
								<DialogTitle>
									{modal.mode === "create" ? "New" : "Edit"}{" "}
									{ENTITY_LABEL[modal.entity]}
								</DialogTitle>
							</DialogHeader>

							<div className="h-fit px-1 pb-1">
								{modal.entity === "employee" && (
									<EmployeeForm
										key={`employee-${modal.mode}-${modal.mode === "edit" ? modal.data.id : "new"}`}
										mode={modal.mode}
										defaultValues={
											modal.mode === "edit"
												? toEmployeeInput(modal.data)
												: undefined
										}
										employeeId={
											modal.mode === "edit" ? modal.data.id : undefined
										}
										qrToken={
											modal.mode === "edit" ? modal.data.qrToken : undefined
										}
										onDirtyChange={setIsDirty}
										onDone={onClose}
									/>
								)}

								{modal.entity === "role" && (
									<RoleForm
										key={`role-${modal.mode}-${modal.mode === "edit" ? modal.data.id : "new"}`}
										mode={modal.mode}
										defaultValues={
											modal.mode === "edit"
												? toRoleInput(modal.data)
												: undefined
										}
										roleId={modal.mode === "edit" ? modal.data.id : undefined}
										isSystem={
											modal.mode === "edit" ? modal.data.isSystem : false
										}
										onDirtyChange={setIsDirty}
										onDone={onClose}
									/>
								)}
							</div>
						</>
					)}
				</DialogContent>
			</Dialog>

			<ConfirmDeleteDialog
				open={confirmDiscardOpen}
				onOpenChange={setConfirmDiscardOpen}
				onConfirm={() => {
					setConfirmDiscardOpen(false);
					setIsDirty(false);
					onClose();
				}}
				title="Discard unsaved changes?"
				description="You have unsaved changes in this form. Closing now will discard them."
			/>
		</>
	);
}
