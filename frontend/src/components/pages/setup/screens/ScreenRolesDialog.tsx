"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	useRolesQuery,
	useUpdateScreenRolesMutation,
} from "@/lib/api/setup/queries";
import type { Screen } from "@/types/setup";

type ScreenRolesDialogProps = {
	screen: Screen | null;
	onClose: () => void;
};

export function ScreenRolesDialog({ screen, onClose }: ScreenRolesDialogProps) {
	return (
		<Dialog
			open={screen !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Roles that see {screen?.label}</DialogTitle>
				</DialogHeader>
				{screen && (
					<RolesChecklist key={screen.key} screen={screen} onDone={onClose} />
				)}
			</DialogContent>
		</Dialog>
	);
}

function RolesChecklist({
	screen,
	onDone,
}: {
	screen: Screen;
	onDone: () => void;
}) {
	const rolesQuery = useRolesQuery();
	const mutation = useUpdateScreenRolesMutation();
	const [selected, setSelected] = useState<Set<number>>(
		new Set(screen.roleIds),
	);

	// super-admin already has every screen and cannot be edited
	const roles = (rolesQuery.data?.data ?? []).filter((r) => !r.isSuperAdmin);
	const added = [...selected].filter((id) => !screen.roleIds.includes(id));
	const removed = screen.roleIds.filter((id) => !selected.has(id));

	function toggle(id: number, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	}

	return (
		<div className="flex flex-col gap-3">
			<p className="text-xs text-muted-foreground">
				Ticking a role gives it the permission that opens this screen.
			</p>
			{roles.map((role) => {
				const id = `screen-role-${role.id}`;
				return (
					<div key={role.id} className="flex items-center gap-2">
						<Checkbox
							id={id}
							checked={selected.has(role.id)}
							onCheckedChange={(checked) => toggle(role.id, checked === true)}
						/>
						<label htmlFor={id} className="text-sm">
							{role.name}
						</label>
					</div>
				);
			})}
			<div className="flex justify-end gap-2">
				<Button variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button
					disabled={added.length + removed.length === 0 || mutation.isPending}
					onClick={() =>
						mutation.mutate(
							{ key: screen.key, diff: { added, removed } },
							{ onSuccess: onDone },
						)
					}
				>
					{mutation.isPending
						? "Saving..."
						: `Save (+${added.length} / −${removed.length})`}
				</Button>
			</div>
		</div>
	);
}
