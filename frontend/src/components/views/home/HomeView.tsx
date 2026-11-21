"use client";

import {
	type Icon,
	IconAlertTriangle,
	IconBox,
	IconChecklist,
	IconClipboardCheck,
	IconClipboardList,
	IconFileDescription,
	IconPackageImport,
	IconSend,
	IconTool,
	IconTruckDelivery,
} from "@tabler/icons-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/EmptyState";
import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard, type StatCardSplit } from "@/components/shared/StatCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeCountsQuery } from "@/lib/api/home/queries";
import type { HomeTile, HomeTileHint, HomeTileKey } from "@/lib/api/home/types";
import { formatDate } from "@/lib/format";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { permissionForPath } from "@/lib/shell/screen-permissions";

type Bucket = "late" | "today" | "later";

type TileConfig = {
	label: string;
	icon: Icon;
	href: string;
	/** Link for the Late / Today / Later chips (BR-FF-15). */
	bucketHref?: (bucket: Bucket) => string;
};

const withBucket = (base: string) => (bucket: Bucket) =>
	`${base}${base.includes("?") ? "&" : "?"}bucket=${bucket}`;

// Targets follow spec-home.md tile table; order comes from the server (BR-FF-13).
const TILES: Record<HomeTileKey, TileConfig> = {
	approvals: {
		label: "Waiting for my approval",
		icon: IconChecklist,
		href: "/approvals",
	},
	my_prs_draft: {
		label: "My requisitions to finish",
		icon: IconClipboardList,
		href: "/purchase-requisitions?mine=1&status=draft",
	},
	my_prs_pending: {
		label: "My requisitions in approval",
		icon: IconClipboardCheck,
		href: "/purchase-requisitions?mine=1&status=pending_approval",
	},
	prs_to_order: {
		label: "Requisitions to order",
		icon: IconFileDescription,
		href: "/purchase-requisitions?toOrder=1",
		bucketHref: withBucket("/purchase-requisitions?toOrder=1"),
	},
	pos_to_send: {
		label: "Orders to send",
		icon: IconSend,
		href: "/purchase-orders?status=approved",
		bucketHref: withBucket("/purchase-orders?status=approved"),
	},
	my_pos_draft: {
		label: "My draft orders",
		icon: IconFileDescription,
		href: "/purchase-orders?mine=1&status=draft",
	},
	pos_late: {
		label: "Orders late",
		icon: IconAlertTriangle,
		href: "/purchase-orders?bucket=late",
	},
	goods_expected: {
		label: "Goods expected",
		icon: IconTruckDelivery,
		href: "/grn/receive",
		bucketHref: withBucket("/grn/receive"),
	},
	grns_to_inspect: {
		label: "Receipts to inspect",
		icon: IconPackageImport,
		href: "/grn?qaStatus=pending",
		bucketHref: withBucket("/grn?qaStatus=pending"),
	},
	jobwork_due: {
		label: "Job-work due back",
		icon: IconTool,
		href: "/subcontracting/challans",
		bucketHref: withBucket("/subcontracting/challans"),
	},
	stock_low: {
		label: "Stock below reorder",
		icon: IconBox,
		href: "/inventory/stock?belowReorder=1",
	},
};

const TONE = {
	waiting: "warning",
	moving: "info",
	neutral: "neutral",
	danger: "danger",
} as const;

function hintText(hint?: HomeTileHint): string | undefined {
	if (!hint) return undefined;
	const date = hint.date ? formatDate(hint.date) : "";
	switch (hint.kind) {
		case "oldest_since":
			return `Oldest waiting since ${date}`;
		case "sent_back":
			return `${hint.n ?? 0} sent back`;
		case "earliest_required":
			return `Earliest needed by ${date}`;
		case "earliest_due":
			return `Earliest due ${date}`;
		case "oldest_due":
			return `Oldest due ${date}`;
		case "oldest_received":
			return `Oldest received ${date}`;
		case "items":
			return `${hint.n ?? 0} ${hint.n === 1 ? "item" : "items"}`;
	}
}

function splitFor(
	tile: HomeTile,
	config: TileConfig,
): StatCardSplit | undefined {
	const { bucketHref } = config;
	if (!bucketHref) return undefined;
	if (
		tile.late === undefined &&
		tile.today === undefined &&
		tile.later === undefined
	)
		return undefined;
	return {
		late: { count: tile.late ?? 0, href: bucketHref("late") },
		today: { count: tile.today ?? 0, href: bucketHref("today") },
		later: { count: tile.later ?? 0, href: bucketHref("later") },
	};
}

function HomeTileCard({
	tile,
	onRetry,
}: {
	tile: HomeTile;
	onRetry: () => void;
}) {
	const config = TILES[tile.key];
	if (!config) return null;
	if (tile.error) {
		return (
			<StatCard
				label={config.label}
				value="–"
				icon={config.icon}
				error
				onRetry={onRetry}
			/>
		);
	}
	const count = tile.count ?? 0;
	return (
		<StatCard
			label={config.label}
			value={count}
			icon={config.icon}
			tone={TONE[tile.tone ?? "neutral"]}
			hint={count === 0 ? "Nothing waiting" : hintText(tile.hint)}
			href={config.href}
			split={count > 0 ? splitFor(tile, config) : undefined}
		/>
	);
}

const GRID = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

function HomeQueues() {
	const query = useHomeCountsQuery();
	const tiles = query.data?.tiles ?? [];

	// BR-FF-17: only the approvals tile available and it is empty -> one message with links.
	const showEmpty =
		tiles.length === 1 && !tiles[0].error && (tiles[0].count ?? 0) === 0;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="Home" description="Work waiting for you" />
			{query.isLoading ? (
				<div className={GRID} aria-busy="true">
					{["a", "b", "c", "d"].map((k) => (
						<Skeleton key={k} className="h-28 w-full" />
					))}
				</div>
			) : query.isError ? (
				<div className={GRID}>
					<StatCard
						label="Work waiting"
						value="–"
						error
						onRetry={() => query.refetch()}
					/>
				</div>
			) : showEmpty ? (
				<EmptyState
					icon={IconChecklist}
					title="Nothing is waiting for you"
					action={
						<div className="flex flex-wrap justify-center gap-3 text-sm font-semibold">
							<Link
								href="/approvals"
								className="text-brand-accent underline-offset-4 hover:underline"
							>
								Approvals
							</Link>
							<Link
								href="/grn"
								className="text-brand-accent underline-offset-4 hover:underline"
							>
								Goods receipts
							</Link>
						</div>
					}
				/>
			) : (
				<div className={GRID}>
					{tiles.map((tile) => (
						<HomeTileCard
							key={tile.key}
							tile={tile}
							onRetry={() => query.refetch()}
						/>
					))}
				</div>
			)}
		</div>
	);
}

/** The shell sent the user here from a screen they cannot open (`denied` path). */
function DeniedHome({ denied }: { denied: string }) {
	useBreadcrumbLast("No access");
	return <NoAccessState path={denied} permission={permissionForPath(denied)} />;
}

/** Home page: the role's work queues, or the no-access message for a `denied` path. */
export default function HomeView({ denied }: { denied?: string }) {
	if (denied) return <DeniedHome denied={denied} />;
	return <HomeQueues />;
}
