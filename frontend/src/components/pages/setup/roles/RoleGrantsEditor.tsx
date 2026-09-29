"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
	useRoleGrantsQuery,
	useUpdateRoleGrantsMutation,
} from "@/lib/api/setup/queries";
import type { GrantKey, RoleGrants } from "@/types/setup";

type RoleGrantsEditorProps = {
	roleId: number | null;
	onClose: () => void;
};

export function RoleGrantsEditor({ roleId, onClose }: RoleGrantsEditorProps) {
	const grantsQuery = useRoleGrantsQuery(roleId);
	const grants = grantsQuery.data?.data;

	return (
		<Dialog
			open={roleId !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						Access{grants ? `: ${grants.roleName}` : ""}
					</DialogTitle>
				</DialogHeader>
				{grantsQuery.isLoading || !grants ? (
					<Skeleton className="h-40 w-full" />
				) : (
					<GrantsGrid
						key={`${grants.roleId}-${grants.keys
							.filter((k) => k.granted)
							.map((k) => k.key)
							.sort()
							.join(",")}`}
						grants={grants}
						onDone={onClose}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function GrantsGrid({
	grants,
	onDone,
}: {
	grants: RoleGrants;
	onDone: () => void;
}) {
	const mutation = useUpdateRoleGrantsMutation();
	const original = useMemo(
		() => new Set(grants.keys.filter((k) => k.granted).map((k) => k.key)),
		[grants],
	);
	const [selected, setSelected] = useState<Set<string>>(new Set(original));

	const byModule = useMemo(() => {
		const map = new Map<string, GrantKey[]>();
		for (const key of grants.keys) {
			map.set(key.module, [...(map.get(key.module) ?? []), key]);
		}
		return [...map.entries()];
	}, [grants]);

	const added = grants.keys.filter(
		(k) => selected.has(k.key) && !original.has(k.key),
	);
	const removed = grants.keys.filter(
		(k) => !selected.has(k.key) && original.has(k.key),
	);
	const changed = added.length + removed.length > 0;

	function toggle(key: string, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (checked) next.add(key);
			else next.delete(key);
			return next;
		});
	}

	function save() {
		mutation.mutate(
			{
				id: grants.roleId,
				diff: {
					added: added.map((k) => k.key),
					removed: removed.map((k) => k.key),
				},
			},
			{ onSuccess: onDone },
		);
	}

	if (grants.readOnly) {
		return (
			<p className="text-sm text-muted-foreground">
				Super-admin has all access. It cannot be edited.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{byModule.map(([module, keys]) => (
				<fieldset key={module} className="flex flex-col gap-2">
					<legend className="mb-1 text-sm font-semibold capitalize">
						{module}
					</legend>
					{keys.map((k) => {
						const id = `grant-${k.key}`;
						return (
							<div key={k.key} className="flex items-start gap-2">
								<Checkbox
									id={id}
									checked={selected.has(k.key)}
									disabled={!k.grantable}
									onCheckedChange={(checked) => toggle(k.key, checked === true)}
								/>
								<label htmlFor={id} className="flex flex-col text-sm">
									<span>
										{k.label}
										{!k.grantable && (
											<span className="ml-2 text-xs text-muted-foreground">
												super-admin only
											</span>
										)}
									</span>
									{k.description && (
										<span className="text-xs text-muted-foreground">
											{k.description}
										</span>
									)}
								</label>
							</div>
						);
					})}
				</fieldset>
			))}

			<div className="rounded-md border p-3 text-sm" aria-live="polite">
				{changed ? (
					<ul className="flex flex-col gap-1">
						{added.map((k) => (
							<li key={k.key} className="text-green-700 dark:text-green-400">
								+ {k.label}
							</li>
						))}
						{removed.map((k) => (
							<li key={k.key} className="text-red-700 dark:text-red-400">
								− {k.label}
							</li>
						))}
					</ul>
				) : (
					<span className="text-muted-foreground">No changes yet.</span>
				)}
			</div>

			<div className="flex justify-end gap-2">
				<Button variant="outline" onClick={onDone}>
					Cancel
				</Button>
				<Button onClick={save} disabled={!changed || mutation.isPending}>
					{mutation.isPending
						? "Saving..."
						: `Save (+${added.length} / −${removed.length})`}
				</Button>
			</div>
		</div>
	);
}
