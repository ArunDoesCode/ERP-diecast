import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { type BomDetail, bomKindLabels } from "@/types/bom";
import { formatKg, formatPct } from "./bom-format";

function Field({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div>
			<dt className="text-[13px] text-muted-foreground">
				{label}
				{hint ? <span className="ml-1 text-[13px]">({hint})</span> : null}
			</dt>
			<dd className="tabular-nums">{value}</dd>
		</div>
	);
}

function itemText(
	ref: { sku: string; name: string; inactive: boolean } | null,
	fallback: string | null,
) {
	if (!ref) return fallback ?? "–";
	return `${ref.sku} · ${ref.name}${ref.inactive ? " (Inactive)" : ""}`;
}

export function BomHeaderCard({ bom }: { bom: BomDetail }) {
	const { casting, jobWork } = bom;
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Header</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						<Field label="Kind" value={bomKindLabels[bom.kind]} />
						{casting ? (
							<>
								<Field label="Alloy" value={itemText(casting.alloy, null)} />
								<Field
									label="Net weight"
									value={formatKg(casting.netWeightKg)}
								/>
								<Field
									label="Shot weight"
									value={formatKg(casting.shotWeightKg)}
								/>
								<Field
									label="Cavities"
									value={
										casting.cavities === null ? "–" : String(casting.cavities)
									}
								/>
								<Field
									label="Melt loss"
									value={formatPct(casting.meltLossPct)}
								/>
								<Field
									label="Casting reject"
									value={formatPct(casting.castingRejectPct)}
								/>
								<Field
									label="Poured weight per piece"
									hint="calculated"
									value={formatKg(casting.computed.pouredWeightKg)}
								/>
								<Field
									label="Casting yield"
									hint="calculated"
									value={formatPct(casting.computed.yieldPct)}
								/>
								<Field
									label="Alloy per good piece"
									hint="calculated"
									value={formatKg(casting.computed.alloyPerGoodPieceKg)}
								/>
							</>
						) : null}
						{jobWork ? (
							<>
								<Field
									label="Sent item"
									value={itemText(jobWork.sentItem, null)}
								/>
								<Field
									label="Send : return"
									value={`${jobWork.sendQty ?? "–"} : ${jobWork.returnQty ?? "–"}`}
								/>
								<Field
									label="Job worker"
									value={
										jobWork.jobWorkerName
											? `${jobWork.jobWorkerName}${jobWork.jobWorkerInactive ? " (Inactive)" : ""}`
											: "–"
									}
								/>
								<Field
									label="Service"
									value={
										jobWork.serviceName
											? `${jobWork.serviceName}${jobWork.serviceInactive ? " (Inactive)" : ""}`
											: "–"
									}
								/>
								<Field label="Loss" value={formatPct(jobWork.jobWorkLossPct)} />
							</>
						) : null}
						{!casting && !jobWork ? (
							<p className="text-muted-foreground sm:col-span-2">
								An assembly has no header data, only components.
							</p>
						) : null}
					</dl>
				</CardContent>
			</Card>
			{bom.changeReason ? (
				<Card>
					<CardHeader>
						<CardTitle>Change reason</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1 text-sm">
						<p>{bom.changeReason}</p>
						<p className="text-[13px] text-muted-foreground">
							Released by {bom.releasedByName ?? "–"}{" "}
							{formatDateTime(bom.releasedAt)}
						</p>
					</CardContent>
				</Card>
			) : null}
			{bom.status === "retired" && bom.retireReason ? (
				<Card>
					<CardHeader>
						<CardTitle>Retired</CardTitle>
					</CardHeader>
					<CardContent className="space-y-1 text-sm">
						<p>{bom.retireReason}</p>
						<p className="text-[13px] text-muted-foreground">
							Retired by {bom.retiredByName ?? "–"}{" "}
							{formatDateTime(bom.retiredAt)}
						</p>
					</CardContent>
				</Card>
			) : null}
		</>
	);
}

export function BomHeaderCardSkeleton() {
	return (
		<>
			<Skeleton className="h-48" />
			<Skeleton className="h-48" />
		</>
	);
}
