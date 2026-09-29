"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { useUpdateScreenMutation } from "@/lib/api/setup/queries";
import type { Screen, ScreenUpdateInput } from "@/types/setup";

type ScreenRowProps = {
	screen: Screen;
	onEditRoles: () => void;
};

export function ScreenRow({ screen, onEditRoles }: ScreenRowProps) {
	const mutation = useUpdateScreenMutation();
	const [label, setLabel] = useState(screen.label);
	const [sortOrder, setSortOrder] = useState(String(screen.sortOrder));
	const [menuGroup, setMenuGroup] = useState(screen.menuGroup ?? "");

	const input: ScreenUpdateInput = {};
	if (label.trim() !== screen.label) input.label = label.trim();
	if (sortOrder !== "" && Number(sortOrder) !== screen.sortOrder) {
		input.sortOrder = Number(sortOrder);
	}
	if (menuGroup.trim() !== (screen.menuGroup ?? "")) {
		input.menuGroup = menuGroup.trim();
	}
	const dirty = Object.keys(input).length > 0;
	const valid = label.trim() !== "" && Number.isInteger(Number(sortOrder));

	return (
		<TableRow>
			<TableCell className="text-xs text-muted-foreground">
				{screen.path}
			</TableCell>
			<TableCell>
				<Input
					aria-label={`Label for ${screen.key}`}
					value={label}
					onChange={(event) => setLabel(event.target.value)}
				/>
			</TableCell>
			<TableCell>
				<Input
					aria-label={`Order for ${screen.key}`}
					type="number"
					className="w-20"
					value={sortOrder}
					onChange={(event) => setSortOrder(event.target.value)}
				/>
			</TableCell>
			<TableCell>
				<Input
					aria-label={`Menu group for ${screen.key}`}
					value={menuGroup}
					onChange={(event) => setMenuGroup(event.target.value)}
				/>
			</TableCell>
			<TableCell>
				{screen.permissionKey ? (
					<Button variant="outline" size="sm" onClick={onEditRoles}>
						{screen.roleIds.length} role(s)
					</Button>
				) : (
					<span className="text-xs text-muted-foreground">No key</span>
				)}
			</TableCell>
			<TableCell>
				<Button
					size="sm"
					disabled={!dirty || !valid || mutation.isPending}
					onClick={() => mutation.mutate({ key: screen.key, input })}
				>
					{mutation.isPending ? "Saving..." : "Save"}
				</Button>
			</TableCell>
		</TableRow>
	);
}
