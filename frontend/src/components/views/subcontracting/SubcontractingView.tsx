"use client";

import { IconPlus, IconSearch, IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { PurchaseRequisitionsPagination } from "@/components/pages/purchase-requisitions/PurchaseRequisitionsPagination";
import { ScoCards } from "@/components/pages/subcontracting/ScoCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	SCO_STATUS_FILTER_OPTIONS,
	useScoControls,
} from "@/components/views/subcontracting/use-sco-controls";
import { useCan } from "@/hooks/use-can";
import { useScosQuery } from "@/lib/api/subcontracting/queries";
import type { ScoSortField, ScoStatus } from "@/types/subcontracting";

const SORT_FIELDS: Array<{ label: string; value: ScoSortField }> = [
	{ label: "Created", value: "createdAt" },
	{ label: "SCO number", value: "scoNumber" },
	{ label: "Status", value: "status" },
	{ label: "Return date", value: "expectedReturnDate" },
];

export function SubcontractingView() {
	const canManage = useCan("sco.manage");
	const canEditCompany = useCan("company.manage");
	const controls = useScoControls();

	const scoQuery = useScosQuery({
		page: controls.page,
		pageSize: controls.pageSize,
		sortBy: controls.sortBy,
		sortDir: controls.sortDir,
		status: controls.status,
		q: controls.q,
	});

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="font-heading text-lg font-medium">
						Subcontracting orders
					</h1>
					<p className="text-xs text-muted-foreground">
						Send raw material to a vendor for job work and track it back.
					</p>
				</div>
				<div className="flex gap-2">
					{canEditCompany ? (
						<Button type="button" size="sm" variant="outline" asChild>
							<Link href="/subcontracting/settings">
								<IconSettings className="size-3.5" />
								Company details
							</Link>
						</Button>
					) : null}
					{canManage ? (
						<Button type="button" size="sm" asChild>
							<Link href="/subcontracting/new">
								<IconPlus className="size-3.5" />
								New SCO
							</Link>
						</Button>
					) : null}
				</div>
			</div>

			<div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
				<div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
					<Select
						value={controls.statusFilter}
						onValueChange={(value) =>
							controls.onStatusFilterChange(value as "all" | ScoStatus)
						}
					>
						<SelectTrigger className="w-full sm:w-64" aria-label="Status">
							<SelectValue placeholder="Status" />
						</SelectTrigger>
						<SelectContent>
							{SCO_STATUS_FILTER_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="relative w-full sm:max-w-sm">
						<IconSearch className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={controls.qInput}
							onChange={(event) => controls.onQChange(event.target.value)}
							placeholder="Search SCO number or vendor"
							aria-label="Search SCO number or vendor"
							className="pl-7"
						/>
					</div>

					<Select
						value={controls.sortBy}
						onValueChange={(value) =>
							controls.onSortByChange(value as ScoSortField)
						}
					>
						<SelectTrigger className="w-full sm:w-44" aria-label="Sort by">
							<SelectValue placeholder="Sort by" />
						</SelectTrigger>
						<SelectContent>
							{SORT_FIELDS.map((field) => (
								<SelectItem key={field.value} value={field.value}>
									{field.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>Asc</span>
					<Switch
						checked={controls.sortDir === "desc"}
						onCheckedChange={controls.onSortDirectionChange}
						aria-label="Toggle sort direction"
					/>
					<span>Dsc</span>
				</div>
			</div>

			<ScoCards
				orders={scoQuery.data?.data ?? []}
				isLoading={scoQuery.isLoading}
			/>

			<PurchaseRequisitionsPagination
				page={controls.page}
				pageSize={controls.pageSize}
				meta={scoQuery.data?.meta}
				onPageChange={controls.setPage}
				onPageSizeChange={controls.onPageSizeChange}
			/>
		</div>
	);
}
