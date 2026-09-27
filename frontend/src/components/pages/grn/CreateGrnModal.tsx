"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useCreateGrnMutation } from "@/lib/api/grn/queries";
import { usePurchaseOrderDetailQuery } from "@/lib/api/purchase-orders/queries";
import type { PurchaseOrderItem } from "@/types/purchase-orders";

function remainingQty(item: PurchaseOrderItem) {
	return item.qty - item.receivedQty;
}

export function CreateGrnModal({
	poId,
	open,
	onOpenChange,
	onCreated,
}: {
	poId: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: () => void;
}) {
	const detailQuery = usePurchaseOrderDetailQuery(poId, open);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const po = detail?.po;
	const remainingLines = useMemo(
		() => (detail?.items ?? []).filter((item) => remainingQty(item) > 0),
		[detail],
	);

	const [challanNo, setChallanNo] = useState("");
	const [challanDate, setChallanDate] = useState("");
	const [vehicleNo, setVehicleNo] = useState("");
	const [driverName, setDriverName] = useState("");
	const [driverPhone, setDriverPhone] = useState("");
	const [remarks, setRemarks] = useState("");
	const [arrivedQty, setArrivedQty] = useState<Record<number, string>>({});
	const createMutation = useCreateGrnMutation();

	function qtyFor(item: PurchaseOrderItem) {
		return arrivedQty[item.id] ?? String(remainingQty(item));
	}

	function reset() {
		setChallanNo("");
		setChallanDate("");
		setVehicleNo("");
		setDriverName("");
		setDriverPhone("");
		setRemarks("");
		setArrivedQty({});
	}

	const lines = remainingLines
		.map((item) => ({
			poItemId: item.id,
			arrivedQty: Number(qtyFor(item) || 0),
		}))
		.filter((line) => line.arrivedQty > 0);

	function onSubmit() {
		if (lines.length === 0) return;

		createMutation.mutate(
			{
				poId,
				challanNo: challanNo.trim() || undefined,
				challanDate: challanDate || undefined,
				vehicleNo: vehicleNo.trim() || undefined,
				driverName: driverName.trim() || undefined,
				driverPhone: driverPhone.trim() || undefined,
				remarks: remarks.trim() || undefined,
				lines,
			},
			{
				onSuccess: (result) => {
					if (result.success) {
						reset();
						onCreated();
					}
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) reset();
				onOpenChange(next);
			}}
		>
			<DialogContent className="min-w-[min(56rem,calc(100vw-2rem))] gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>
						Receive goods · {po?.poNumber ?? `PO #${poId}`}
					</DialogTitle>
					<DialogDescription>
						Record what physically arrived against this PO's remaining lines.
					</DialogDescription>
				</DialogHeader>

				{detailQuery.isLoading || !po ? (
					<div className="space-y-3 px-6 py-6">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-40 w-full" />
					</div>
				) : (
					<>
						<div className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-5">
							<div className="grid gap-3 md:grid-cols-3">
								<div>
									<label
										htmlFor="grn-create-challan-no"
										className="mb-1 block text-xs font-medium"
									>
										Challan no
									</label>
									<Input
										id="grn-create-challan-no"
										value={challanNo}
										onChange={(event) => setChallanNo(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-create-challan-date"
										className="mb-1 block text-xs font-medium"
									>
										Challan date
									</label>
									<Input
										id="grn-create-challan-date"
										type="date"
										value={challanDate}
										onChange={(event) => setChallanDate(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-create-vehicle-no"
										className="mb-1 block text-xs font-medium"
									>
										Vehicle no
									</label>
									<Input
										id="grn-create-vehicle-no"
										value={vehicleNo}
										onChange={(event) => setVehicleNo(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-create-driver-name"
										className="mb-1 block text-xs font-medium"
									>
										Driver name
									</label>
									<Input
										id="grn-create-driver-name"
										value={driverName}
										onChange={(event) => setDriverName(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-create-driver-phone"
										className="mb-1 block text-xs font-medium"
									>
										Driver phone
									</label>
									<Input
										id="grn-create-driver-phone"
										value={driverPhone}
										onChange={(event) => setDriverPhone(event.target.value)}
									/>
								</div>
							</div>

							<div>
								<label
									htmlFor="grn-create-remarks"
									className="mb-1 block text-xs font-medium"
								>
									Remarks
								</label>
								<Textarea
									id="grn-create-remarks"
									value={remarks}
									onChange={(event) => setRemarks(event.target.value)}
									placeholder="Optional"
								/>
							</div>

							<div className="space-y-2">
								{remainingLines.map((item) => (
									<div
										key={item.id}
										className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_8rem_8rem] md:items-center"
									>
										<div className="min-w-0">
											<span className="font-medium">
												{item.itemName ?? "-"}
											</span>
											<p className="text-xs text-muted-foreground">
												{item.itemSku ?? "-"}
											</p>
										</div>
										<div className="text-xs text-muted-foreground">
											<p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
												Remaining
											</p>
											<p>
												{remainingQty(item)} {item.uom ?? ""}
											</p>
										</div>
										<div>
											<label
												htmlFor={`grn-create-arrived-qty-${item.id}`}
												className="mb-1 block text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase"
											>
												Arrived qty
											</label>
											<Input
												id={`grn-create-arrived-qty-${item.id}`}
												type="number"
												min={0}
												max={remainingQty(item)}
												value={qtyFor(item)}
												onChange={(event) =>
													setArrivedQty((current) => ({
														...current,
														[item.id]: event.target.value,
													}))
												}
											/>
										</div>
									</div>
								))}
								{remainingLines.length === 0 ? (
									<p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
										All lines on this PO have already been fully received.
									</p>
								) : null}
							</div>
						</div>

						<DialogFooter className="border-t px-6 py-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button
								type="button"
								disabled={lines.length === 0 || createMutation.isPending}
								onClick={onSubmit}
							>
								Record GRN · {lines.length} line{lines.length === 1 ? "" : "s"}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
