"use client";

import { RoleTable } from "@/components/pages/setup/roles/RoleTable";
import { Button } from "@/components/ui/button";
import type { Role } from "@/types/setup";

type RolesTabProps = {
	onCreateRole: () => void;
	onEditRole: (role: Role) => void;
};

export function RolesTab({ onCreateRole, onEditRole }: RolesTabProps) {
	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-end">
				<Button onClick={onCreateRole}>+ New Role</Button>
			</div>

			<RoleTable onEditRole={onEditRole} />
		</div>
	);
}
