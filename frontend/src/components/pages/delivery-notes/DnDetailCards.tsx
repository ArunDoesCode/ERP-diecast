"use client";

import { useState } from "react";

import {
	groupEway,
	MODE_LABEL,
	TRANSPORT_FIELD_LABEL,
} from "@/components/pages/delivery-notes/dn-format";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useTransportHistoryQuery } from "@/lib/api/delivery-note/queries";
import {
	formatDate,
	formatDateTime,
	formatMoney,
	formatQty,
} from "@/lib/format";
import { type DnDetail, dnQtyDecimals } from "@/types/delivery-note";

const LOW = "max-[1099px]:hidden";

export function DnLinesCard({ note }: { note: DnDetail }) {
	const showMoney = note.valuePaise !== undefined;
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Lines</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>#</TableHead>
							<TableHead>Item</TableHead>
							<TableHead className={LOW}>HSN</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead>Lot</TableHead>
							{showMoney ? (
								<>
									<TableHead className="text-right">Price</TableHead>
									<TableHead className="text-right">Taxable</TableHead>
									<TableHead className={`${LOW} text-right`}>GST %</TableHead>
									<TableHead className="text-right">GST</TableHead>
								</>
							) : null}
						</TableRow>
					</TableHeader>
					<TableBody>
						{note.lines.map((line, index) => (
							<TableRow key={line.id}>
								<TableCell>{index + 1}</TableCell>
								<TableCell className="whitespace-normal">
									<span className="font-mono">{line.item.sku}</span>
									<span className="block text-[13px] text-muted-foreground">
										{line.item.name}
									</span>
								</TableCell>
								<TableCell className={LOW}>
									{line.item.hsnCode ?? "–"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatQty(line.qty, line.uom, dnQtyDecimals(line.uom))}
								</TableCell>
								<TableCell>{line.lotNo ?? "–"}</TableCell>
								{showMoney ? (
									<>
										<TableCell className="text-right tabular-nums">
											{formatMoney(line.unitPricePaise)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatMoney(line.taxablePaise)}
										</TableCell>
										<TableCell className={`${LOW} text-right tabular-nums`}>
											{line.gstPercent}%
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatMoney(line.gstPaise)}
										</TableCell>
									</>
								) : null}
							</TableRow>
						))}
					</TableBody>
					{showMoney ? (
						<TableFooter>
							<TableRow>
								<TableCell colSpan={5} className="text-right">
									Total
								</TableCell>
								<TableCell />
								<TableCell className="text-right tabular-nums">
									{formatMoney(note.taxablePaise)}
								</TableCell>
								<TableCell className={LOW} />
								<TableCell className="text-right tabular-nums">
									{formatMoney(note.gstPaise)}
								</TableCell>
							</TableRow>
						</TableFooter>
					) : null}
				</Table>
				{showMoney ? (
					<p className="text-right text-sm font-medium">
						Note value {formatMoney(note.valuePaise)}
					</p>
				) : null}
				{note.remarks ? (
					<p className="text-sm">
						<span className="text-muted-foreground">Remarks: </span>
						{note.remarks}
					</p>
				) : null}
			</CardContent>
		</Card>
	);
}

export function DnPackagesCard({ note }: { note: DnDetail }) {
	if (note.packages.length === 0) return null;
	const skuOf = (soLineId: number) =>
		note.lines.find((line) => line.soLineId === soLineId)?.item.sku ?? "–";
	const net = note.packages.reduce((sum, pkg) => sum + pkg.netKg, 0);
	const gross = note.packages.reduce((sum, pkg) => sum + pkg.grossKg, 0);
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Packages</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-2">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Package no.</TableHead>
							<TableHead>Line</TableHead>
							<TableHead className="text-right">Qty</TableHead>
							<TableHead className="text-right">Net kg</TableHead>
							<TableHead className="text-right">Gross kg</TableHead>
							<TableHead>Lot</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{note.packages.map((pkg) => (
							<TableRow key={pkg.id}>
								<TableCell className="font-mono">{pkg.packageNo}</TableCell>
								<TableCell className="font-mono">
									{skuOf(pkg.soLineId)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatQty(pkg.qty, null, 3)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatQty(pkg.netKg, null, 3)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatQty(pkg.grossKg, null, 3)}
								</TableCell>
								<TableCell>{pkg.lotNo ?? "–"}</TableCell>
							</TableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={3} className="text-right">
								Total
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(net, null, 3)}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{formatQty(gross, null, 3)}
							</TableCell>
							<TableCell />
						</TableRow>
					</TableFooter>
				</Table>
				<p className="text-[13px] text-muted-foreground">
					Packed quantity equals the note quantity on every packed line.
				</p>
			</CardContent>
		</Card>
	);
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex justify-between gap-3">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="text-right">{value}</dd>
		</div>
	);
}

export function DnTransportCard({
	note,
	canUpdate,
	onUpdate,
}: {
	note: DnDetail;
	canUpdate: boolean;
	onUpdate: () => void;
}) {
	const t = note.transport;
	const road = t.mode === "road";
	return (
		<Card size="sm">
			<CardHeader className="flex-row items-center justify-between gap-2">
				<CardTitle>Transport and e-way bill</CardTitle>
				{note.status === "posted" && canUpdate ? (
					<Button type="button" size="sm" variant="outline" onClick={onUpdate}>
						Update transport
					</Button>
				) : null}
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{note.ewayNeeded ? (
					<div className="flex flex-wrap items-center gap-2">
						<StatusBadge
							doc="dnTag"
							status={t.ewayBillNo ? "eway_needed" : "eway_missing"}
						/>
						{note.ewayExpired ? (
							<StatusBadge doc="dnTag" status="eway_expired" />
						) : null}
					</div>
				) : (
					<p className="text-[13px] text-muted-foreground">
						E-way bill not needed for this note.
					</p>
				)}
				<dl className="space-y-1.5 text-sm">
					<Fact label="Mode" value={t.mode ? MODE_LABEL[t.mode] : "–"} />
					{road ? (
						<>
							<Fact
								label="Vehicle no."
								value={<span className="font-mono">{t.vehicleNo ?? "–"}</span>}
							/>
							<Fact
								label="Transporter ID"
								value={
									<span className="font-mono">{t.transporterId ?? "–"}</span>
								}
							/>
						</>
					) : (
						<>
							<Fact label="Transport doc no." value={t.transportDocNo ?? "–"} />
							<Fact
								label="Transport doc date"
								value={formatDate(t.transportDocDate)}
							/>
						</>
					)}
					<Fact label="Transport name" value={t.transporterName ?? "–"} />
					<Fact
						label="Distance"
						value={t.distanceKm === null ? "–" : `${t.distanceKm} km`}
					/>
					<Fact
						label="E-way bill no."
						value={<span className="font-mono">{groupEway(t.ewayBillNo)}</span>}
					/>
					<Fact label="E-way bill date" value={formatDate(t.ewayBillDate)} />
					<Fact
						label="Valid until"
						value={t.ewayBillNo ? formatDateTime(note.ewayValidUntil) : "–"}
					/>
				</dl>
			</CardContent>
		</Card>
	);
}

export function DnHistoryCard({ note }: { note: DnDetail }) {
	const [page, setPage] = useState(1);
	const query = useTransportHistoryQuery(
		note.id,
		page,
		note.status !== "draft",
	);
	const rows = query.data?.data ?? [];
	const meta = query.data?.meta;
	if (note.status === "draft") return null;
	if (query.isLoading) return <Skeleton className="h-24" />;
	if (rows.length === 0 && page === 1) return null;
	return (
		<Card size="sm">
			<CardHeader>
				<CardTitle>Change history</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<ol className="space-y-2 text-sm">
					{rows.map((row) => (
						<li key={row.id} className="space-y-0.5">
							<p>
								<span className="font-medium">
									{TRANSPORT_FIELD_LABEL[row.field] ?? row.field}
								</span>
								: {row.oldValue ?? "–"} → {row.newValue}
							</p>
							<p className="text-[13px] text-muted-foreground">
								{row.changedByName ?? `user ${row.changedBy}`} ·{" "}
								{formatDateTime(row.changedAt)}
							</p>
						</li>
					))}
				</ol>
				{meta && meta.totalPages > 1 ? (
					<div className="flex items-center justify-between text-[13px]">
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={page <= 1}
							onClick={() => setPage((p) => p - 1)}
						>
							Newer
						</Button>
						<span className="tabular-nums text-muted-foreground">
							Page {page} of {meta.totalPages}
						</span>
						<Button
							type="button"
							size="sm"
							variant="outline"
							disabled={page >= meta.totalPages}
							onClick={() => setPage((p) => p + 1)}
						>
							Older
						</Button>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
