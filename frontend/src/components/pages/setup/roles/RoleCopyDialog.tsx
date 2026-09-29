"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCopyRoleMutation } from "@/lib/api/setup/queries";
import type { Role } from "@/types/setup";

type RoleCopyDialogProps = {
	role: Role | null;
	onClose: () => void;
};

export function RoleCopyDialog({ role, onClose }: RoleCopyDialogProps) {
	return (
		<Dialog
			open={role !== null}
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Copy role</DialogTitle>
				</DialogHeader>
				{role && <CopyForm key={role.id} role={role} onDone={onClose} />}
			</DialogContent>
		</Dialog>
	);
}

function CopyForm({ role, onDone }: { role: Role; onDone: () => void }) {
	const [name, setName] = useState(`${role.name} (copy)`);
	const mutation = useCopyRoleMutation();

	return (
		<form
			className="flex flex-col gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				if (!name.trim()) return;
				mutation.mutate(
					{ id: role.id, input: { name: name.trim() } },
					{ onSuccess: onDone },
				);
			}}
		>
			<Label htmlFor="copy-role-name">New role name</Label>
			<Input
				id="copy-role-name"
				value={name}
				onChange={(event) => setName(event.target.value)}
			/>
			<p className="text-xs text-muted-foreground">
				Gets the same permissions as {role.name}.
			</p>
			<Button type="submit" disabled={mutation.isPending || !name.trim()}>
				{mutation.isPending ? "Copying..." : "Copy"}
			</Button>
		</form>
	);
}
