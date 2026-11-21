"use client";

import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import Link from "next/link";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { bomErrorMessage, useBomTreeQuery } from "@/lib/api/bom/queries";
import { type BomTreeNode, bomKindLabels } from "@/types/bom";
import { formatBomQty } from "./bom-format";

type TreeRow = {
	key: string;
	node: BomTreeNode;
	level: number;
	expandable: boolean;
	expanded: boolean;
};

function flatten(
	node: BomTreeNode,
	level: number,
	key: string,
	collapsed: ReadonlySet<string>,
	out: TreeRow[],
) {
	const expandable = node.children.length > 0;
	const expanded = expandable && !collapsed.has(key);
	out.push({ key, node, level, expandable, expanded });
	if (expanded) {
		node.children.forEach((child, index) => {
			flatten(child, level + 1, `${key}.${index}`, collapsed, out);
		});
	}
}

function BomCell({ node }: { node: BomTreeNode }) {
	if (node.treatment === "no_bom" || node.treatment === "loop") {
		return <StatusBadge doc="bomNode" status={node.treatment} />;
	}
	if (node.inactive) return <StatusBadge doc="bomNode" status="inactive" />;
	if (node.treatment === "buy_as_is") return <span>Buy as is</span>;
	if (node.treatment === "buy") return <span>Buy</span>;
	if (node.kind) {
		return (
			<span>
				{bomKindLabels[node.kind]}
				{node.revision ? ` · rev ${node.revision}` : ""}
			</span>
		);
	}
	return <span>–</span>;
}

export function BomLevelTree({ bomId }: { bomId: number }) {
	const query = useBomTreeQuery(bomId);
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

	const root = query.data?.data;
	const rows = useMemo(() => {
		const out: TreeRow[] = [];
		if (root) flatten(root, 0, "0", collapsed, out);
		return out;
	}, [root, collapsed]);

	const columns = useMemo<DataTableColumnDef<TreeRow>[]>(
		() => [
			{
				id: "item",
				header: "Item",
				cell: ({ row }) => {
					const { node, level, expandable, expanded, key } = row.original;
					return (
						<div
							className="flex items-center gap-1"
							style={{ paddingLeft: `${level * 20}px` }}
						>
							{expandable ? (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-expanded={expanded}
									aria-label={`${expanded ? "Collapse" : "Expand"} ${node.sku}`}
									onClick={() =>
										setCollapsed((current) => {
											const next = new Set(current);
											if (next.has(key)) next.delete(key);
											else next.add(key);
											return next;
										})
									}
								>
									{expanded ? <IconChevronDown /> : <IconChevronRight />}
								</Button>
							) : (
								<span
									className="inline-block size-8 shrink-0"
									aria-hidden="true"
								/>
							)}
							<Link
								href={`/bom/part/${node.itemId}?sku=${encodeURIComponent(node.sku)}&name=${encodeURIComponent(node.name)}`}
								className="text-brand-accent hover:underline"
							>
								{node.sku}
							</Link>
							<span className="text-muted-foreground">{node.name}</span>
						</div>
					);
				},
			},
			{
				id: "qty",
				header: "Qty per piece",
				meta: { numeric: true },
				cell: ({ row }) =>
					formatBomQty(row.original.node.qtyPerPiece, row.original.node.unit),
			},
			{
				id: "bom",
				header: "BOM",
				cell: ({ row }) => <BomCell node={row.original.node} />,
			},
		],
		[],
	);

	const table = useTable({
		features: dataTableFeatures,
		data: rows,
		columns,
		manualPagination: true,
		manualSorting: true,
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Level tree</CardTitle>
			</CardHeader>
			<CardContent>
				<DataTable
					table={table}
					isLoading={query.isLoading}
					hidePagination
					emptyState={<EmptyState title="No components yet" />}
					errorState={
						query.isError ? (
							<ErrorState
								message={bomErrorMessage(
									query.error,
									"The level tree could not be loaded.",
								)}
								onRetry={() => {
									void query.refetch();
								}}
								retrying={query.isRefetching}
							/>
						) : undefined
					}
				/>
			</CardContent>
		</Card>
	);
}
