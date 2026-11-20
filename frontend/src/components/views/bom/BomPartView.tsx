"use client";

import { IconDots, IconFileOff } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import {
	BomHeaderCard,
	BomHeaderCardSkeleton,
} from "@/components/pages/bom/BomHeaderCard";
import { BomHistoryPanel } from "@/components/pages/bom/BomHistoryPanel";
import { BomLevelTree } from "@/components/pages/bom/BomLevelTree";
import { BomNeedsPanel } from "@/components/pages/bom/BomNeedsPanel";
import { BomRevisionsPanel } from "@/components/pages/bom/BomRevisionsPanel";
import { BomUsedInPanel } from "@/components/pages/bom/BomUsedInPanel";
import { ReleaseBomDialog } from "@/components/pages/bom/ReleaseBomDialog";
import { RetireBomDialog } from "@/components/pages/bom/RetireBomDialog";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	bomErrorMessage,
	useBomQuery,
	useBomsQuery,
	useDeleteBomMutation,
	useStartBomRevisionMutation,
} from "@/lib/api/bom/queries";
import { ApiClientError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { type BomDetail, bomKindLabels } from "@/types/bom";

type Props = {
	partId: number;
	rev?: string;
	/** Display hints from the link that opened the page; used only when the part has no BOM. */
	hintSku?: string;
	hintName?: string;
};

function partHref(partId: number, revision: string) {
	return `/bom/part/${partId}?rev=${revision}`;
}

export function BomPartView({ partId, rev, hintSku, hintName }: Props) {
	const router = useRouter();
	const canManage = useCan("bom.manage");
	const canRelease = useCan("bom.release");
	const revisionsQuery = useBomsQuery({
		partId,
		page: 1,
		pageSize: 100,
		sortBy: "revisionNo",
		sortDir: "desc",
	});
	const revisions = useMemo(
		() => revisionsQuery.data?.data ?? [],
		[revisionsQuery.data],
	);

	// Default revision: active, else the open draft, else the newest (BR-BOM-23).
	const selected = useMemo(
		() =>
			revisions.find((r) => rev && r.revision === rev) ??
			revisions.find((r) => r.status === "active") ??
			revisions.find((r) => r.status === "draft") ??
			revisions[0],
		[revisions, rev],
	);
	const detailQuery = useBomQuery(selected?.id);
	const bom = detailQuery.data?.data;

	const [releaseOpen, setReleaseOpen] = useState(false);
	const [retireOpen, setRetireOpen] = useState(false);
	const [deleteOpen, setDeleteOpen] = useState(false);
	const startRevision = useStartBomRevisionMutation(partId);
	const deleteMutation = useDeleteBomMutation(selected?.id ?? 0);

	const partSku = bom?.part.sku ?? selected?.partSku ?? hintSku;
	const partName = bom?.part.name ?? selected?.partName ?? hintName;
	const docNo = selected?.number;
	useBreadcrumbLast(docNo ?? partSku ?? `Item #${partId}`);

	const itemNames = useMemo(() => {
		const map = new Map<number, string>();
		for (const line of bom?.lines ?? []) {
			map.set(line.componentItemId, `${line.sku} · ${line.name}`);
		}
		if (bom?.casting?.alloyItemId && bom.casting.alloy) {
			map.set(
				bom.casting.alloyItemId,
				`${bom.casting.alloy.sku} · ${bom.casting.alloy.name}`,
			);
		}
		if (bom?.jobWork?.sentItemId && bom.jobWork.sentItem) {
			map.set(
				bom.jobWork.sentItemId,
				`${bom.jobWork.sentItem.sku} · ${bom.jobWork.sentItem.name}`,
			);
		}
		return map;
	}, [bom]);

	const back = { backHref: "/bom", backLabel: "BOMs" };

	if (revisionsQuery.isLoading) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<Skeleton className="h-48" />
				<Skeleton className="h-48" />
			</div>
		);
	}
	if (revisionsQuery.isError) {
		return (
			<div className="flex flex-col gap-4">
				<DetailHeader docNo="" status={null} loading {...back} />
				<ErrorState
					message={bomErrorMessage(
						revisionsQuery.error,
						"The BOM could not be loaded.",
					)}
					onRetry={() => {
						void revisionsQuery.refetch();
					}}
					retrying={revisionsQuery.isRefetching}
				/>
			</div>
		);
	}

	const usedIn = (
		<BomUsedInPanel itemId={partId} unit={bom?.part.unit ?? "pcs"} />
	);

	// A part with no revision: item title, Create BOM, Used in still shown.
	if (!selected) {
		return (
			<div className="flex w-full flex-col gap-4">
				<DetailHeader
					docNo={partSku ?? `Item #${partId}`}
					title={partName}
					status={null}
					actions={
						canManage ? (
							<Button type="button" size="sm" asChild>
								<Link
									href={`/bom/new?part=${partId}${partSku ? `&sku=${encodeURIComponent(partSku)}` : ""}${partName ? `&name=${encodeURIComponent(partName)}` : ""}`}
								>
									Create BOM
								</Link>
							</Button>
						) : undefined
					}
					{...back}
				/>
				<div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
					<EmptyState
						icon={IconFileOff}
						title={`No BOM for ${partSku ?? `item #${partId}`}`}
					/>
					<div className="flex flex-col gap-4">{usedIn}</div>
				</div>
			</div>
		);
	}

	function onStartRevision() {
		startRevision.mutate(undefined, {
			onSuccess: (result) => router.push(`/bom/${result.data.id}/edit`),
			onError: (error) => {
				if (
					error instanceof ApiClientError &&
					error.code === "BOM_DRAFT_OPEN"
				) {
					const details = (
						error.body as {
							details?: { draftId?: number; revision?: string };
						} | null
					)?.details;
					toast.error(
						details?.revision
							? `Draft ${details.revision} is already open`
							: error.message,
						details?.revision
							? {
									action: {
										label: "Open draft",
										onClick: () =>
											router.push(partHref(partId, details.revision as string)),
									},
								}
							: undefined,
					);
					return;
				}
				toast.error(bomErrorMessage(error, "Could not start a revision."));
			},
		});
	}

	function primaryAction(detail: BomDetail) {
		switch (detail.nextStep) {
			case "release":
				return (
					<Button type="button" size="sm" onClick={() => setReleaseOpen(true)}>
						Release
					</Button>
				);
			case "waiting_for_release":
				return (
					<span className="text-sm text-muted-foreground">
						Waiting for release
					</span>
				);
			case "start_revision":
				return (
					<Button
						type="button"
						size="sm"
						disabled={startRevision.isPending}
						onClick={onStartRevision}
					>
						{startRevision.isPending
							? "Starting…"
							: `Start revision ${detail.nextRevision ?? ""}`.trim()}
					</Button>
				);
			case "open_active":
				return detail.activeBomId ? (
					<Button type="button" size="sm" asChild>
						<Link
							href={`/bom/part/${partId}?rev=${
								revisions.find((r) => r.id === detail.activeBomId)?.revision ??
								""
							}`}
						>
							Open active revision
						</Link>
					</Button>
				) : null;
			case "create":
				return canManage ? (
					<Button type="button" size="sm" asChild>
						<Link href={`/bom/new?part=${partId}`}>Create BOM</Link>
					</Button>
				) : null;
			default:
				return null;
		}
	}

	const isDraft = bom?.status === "draft";
	const isActive = bom?.status === "active";
	const showEdit = canManage && isDraft;
	const showDelete = canManage && isDraft;
	const showRetire = canRelease && isActive;
	const hasMore = showEdit || showDelete || showRetire;
	const activeRevision = revisions.find((r) => r.id === bom?.activeBomId);

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={docNo ?? ""}
				title={partName ? `${partSku} · ${partName}` : partSku}
				status={<StatusBadge doc="bom" status={selected.status} />}
				loading={detailQuery.isLoading}
				meta={
					bom
						? [
								{ label: "Part", value: `${bom.part.sku} ${bom.part.name}` },
								{ label: "Kind", value: bomKindLabels[bom.kind] },
								{
									label: "Created",
									value: `${bom.createdByName ?? "–"} ${formatDateTime(bom.createdAt)}`,
								},
								{
									label: "Released",
									value: bom.releasedAt
										? `${bom.releasedByName ?? "–"} ${formatDateTime(bom.releasedAt)}`
										: "–",
								},
							]
						: undefined
				}
				actions={
					bom ? (
						<>
							{primaryAction(bom)}
							{hasMore ? (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button type="button" size="sm" variant="outline">
											<IconDots />
											More
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{showEdit ? (
											<DropdownMenuItem asChild>
												<Link href={`/bom/${bom.id}/edit`}>Edit</Link>
											</DropdownMenuItem>
										) : null}
										{showDelete ? (
											<DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
												Delete draft
											</DropdownMenuItem>
										) : null}
										{showRetire ? (
											<DropdownMenuItem onSelect={() => setRetireOpen(true)}>
												Retire
											</DropdownMenuItem>
										) : null}
									</DropdownMenuContent>
								</DropdownMenu>
							) : null}
						</>
					) : undefined
				}
				{...back}
			/>

			{detailQuery.isError ? (
				<ErrorState
					message={bomErrorMessage(detailQuery.error, "BOM not found")}
					onRetry={() => {
						void detailQuery.refetch();
					}}
					retrying={detailQuery.isRefetching}
				/>
			) : (
				<div className="grid gap-4 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
					<div className="flex min-w-0 flex-col gap-4">
						{bom ? (
							<>
								<BomHeaderCard bom={bom} />
								{bom.kind === "assembly" && bom.lines.length === 0 ? (
									<EmptyState
										title="No components yet"
										action={
											showEdit ? (
												<Button type="button" size="sm" asChild>
													<Link href={`/bom/${bom.id}/edit`}>Edit</Link>
												</Button>
											) : undefined
										}
									/>
								) : (
									<BomLevelTree
										key={`${bom.id}-${bom.version}`}
										bomId={bom.id}
									/>
								)}
							</>
						) : (
							<BomHeaderCardSkeleton />
						)}
					</div>
					<div className="flex min-w-0 flex-col gap-4">
						<BomRevisionsPanel revisions={revisions} selectedId={selected.id} />
						<BomHistoryPanel partId={partId} />
						{bom ? (
							<BomNeedsPanel
								partId={partId}
								selectedStatus={bom.status}
								activeBomId={bom.activeBomId}
								activeHref={
									activeRevision
										? partHref(partId, activeRevision.revision)
										: null
								}
							/>
						) : null}
						{usedIn}
					</div>
				</div>
			)}

			{bom ? (
				<>
					<ReleaseBomDialog
						open={releaseOpen}
						onOpenChange={setReleaseOpen}
						bomId={bom.id}
						number={bom.number}
						partSku={bom.part.sku}
						itemNames={itemNames}
					/>
					<RetireBomDialog
						open={retireOpen}
						onOpenChange={setRetireOpen}
						bomId={bom.id}
						partId={partId}
						number={bom.number}
					/>
					<ConfirmDeleteDialog
						open={deleteOpen}
						onOpenChange={setDeleteOpen}
						isPending={deleteMutation.isPending}
						title={`Delete ${bom.number}?`}
						description="This draft is removed for good. Released revisions are not touched."
						onConfirm={() =>
							deleteMutation.mutate(undefined, {
								onSuccess: () => {
									setDeleteOpen(false);
									router.push("/bom");
								},
							})
						}
					/>
				</>
			) : null}
		</div>
	);
}
