"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/common/SearchableSelect";
import { hourLabel } from "@/components/pages/reorder/reorder-format";
import { ErrorState } from "@/components/shared/ErrorState";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiClientError } from "@/lib/api/client";
import {
	reorderErrorMessage,
	useReorderOwnerCandidatesQuery,
	useReorderSettingsQuery,
	useUpdateReorderSettingsMutation,
} from "@/lib/api/reorder/queries";
import { formatDateTime } from "@/lib/format";
import type { ReorderSettings } from "@/types/reorder";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const NOT_SET = "none";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function ReorderSettingsDialog({ open, onOpenChange }: Props) {
	const query = useReorderSettingsQuery(open);
	const settings = query.data?.data;
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reorder settings</DialogTitle>
					<DialogDescription>
						The daily check turns low stock into one draft requisition.
					</DialogDescription>
				</DialogHeader>
				{query.isLoading ? (
					<div className="flex flex-col gap-3" aria-busy="true">
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
						<Skeleton className="h-9 w-full" />
					</div>
				) : query.isError || !settings ? (
					<ErrorState
						message={reorderErrorMessage(
							query.error,
							"The settings could not be loaded.",
						)}
						onRetry={() => {
							void query.refetch();
						}}
						retrying={query.isRefetching}
					/>
				) : (
					<SettingsForm
						settings={settings}
						onCancel={() => onOpenChange(false)}
						onSaved={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}

function SettingsForm({
	settings,
	onCancel,
	onSaved,
}: {
	settings: ReorderSettings;
	onCancel: () => void;
	onSaved: () => void;
}) {
	const [enabled, setEnabled] = useState(settings.enabled);
	const [runHour, setRunHour] = useState(settings.runHour);
	const [ownerId, setOwnerId] = useState<number | null>(
		settings.draftOwner?.id ?? null,
	);
	const [ownerSearch, setOwnerSearch] = useState("");
	const [ownerError, setOwnerError] = useState<string | null>(null);
	const search = useDebouncedValue(ownerSearch, 300).trim();
	const candidates = useReorderOwnerCandidatesQuery({
		q: search || undefined,
		page: 1,
		pageSize: 20,
		sortBy: "name",
		sortDir: "asc",
	});
	const save = useUpdateReorderSettingsMutation();

	const options = useMemo(() => {
		const rows = (candidates.data?.data ?? []).map((row) => ({
			value: String(row.id),
			label: row.name,
		}));
		const current = settings.draftOwner;
		if (current && !rows.some((row) => row.value === String(current.id))) {
			rows.unshift({ value: String(current.id), label: current.name });
		}
		if (!enabled) {
			rows.unshift({ value: NOT_SET, label: "Not set" });
		}
		return rows;
	}, [candidates.data, settings.draftOwner, enabled]);

	function onSubmit(event: React.FormEvent) {
		event.preventDefault();
		setOwnerError(null);
		if (enabled && ownerId === null) {
			setOwnerError("Choose a draft owner before turning the daily check on");
			return;
		}
		save.mutate(
			{ enabled, runHour, draftOwnerId: ownerId },
			{
				onSuccess: onSaved,
				onError: (error) => {
					if (
						error instanceof ApiClientError &&
						error.code === "REORDER_OWNER_INVALID"
					) {
						setOwnerError(
							enabled && ownerId === null
								? "Choose a draft owner before turning the daily check on"
								: "Choose an active person who can manage requisitions",
						);
						return;
					}
					setOwnerError(null);
					toast.error(
						reorderErrorMessage(error, "The settings could not be saved."),
					);
				},
			},
		);
	}

	return (
		<form onSubmit={onSubmit} className="flex flex-col gap-3">
			<div className="flex min-h-19 flex-col gap-1.5">
				<Label htmlFor="reorder-enabled">Daily check</Label>
				<div className="flex h-9 items-center gap-2">
					<Switch
						id="reorder-enabled"
						checked={enabled}
						onCheckedChange={setEnabled}
					/>
					<span className="text-sm">{enabled ? "On" : "Off"}</span>
				</div>
			</div>

			<div className="flex min-h-19 flex-col gap-1.5">
				<Label htmlFor="reorder-run-hour">Run time (IST)</Label>
				<Select
					value={String(runHour)}
					onValueChange={(value) => setRunHour(Number(value))}
				>
					<SelectTrigger id="reorder-run-hour" className="w-full">
						<SelectValue placeholder="Select a time" />
					</SelectTrigger>
					<SelectContent>
						{HOURS.map((hour) => (
							<SelectItem key={hour} value={String(hour)}>
								{hourLabel(hour)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<p className="text-[13px] text-muted-foreground">Plant time (IST)</p>
			</div>

			<div className="flex min-h-19 flex-col gap-1.5">
				<Label htmlFor="reorder-owner">Draft owner</Label>
				<SearchableSelect
					id="reorder-owner"
					value={
						ownerId === null ? (enabled ? undefined : NOT_SET) : String(ownerId)
					}
					options={options}
					onValueChange={(value) => {
						setOwnerError(null);
						setOwnerId(value === NOT_SET ? null : Number(value));
					}}
					searchValue={ownerSearch}
					onSearchChange={setOwnerSearch}
					placeholder={enabled ? "Choose a person" : "Not set"}
					searchPlaceholder="Search people"
					isLoading={candidates.isLoading}
				/>
				{ownerError ? (
					<p role="alert" className="text-[13px] text-destructive">
						{ownerError}
					</p>
				) : (
					<p className="text-[13px] text-muted-foreground">
						This person edits and submits the draft
					</p>
				)}
			</div>

			{settings.updatedBy ? (
				<p className="text-[13px] text-muted-foreground">
					Last changed by {settings.updatedBy.name} on{" "}
					{formatDateTime(settings.updatedAt)}
				</p>
			) : null}

			<DialogFooter>
				<Button type="button" variant="outline" size="sm" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" size="sm" disabled={save.isPending}>
					{save.isPending ? "Saving…" : "Save settings"}
				</Button>
			</DialogFooter>
		</form>
	);
}
