"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
import { useGrnDetailQuery, useUpdateGrnMutation } from "@/lib/api/grn/queries";

export function EditGrnModal({
	grnId,
	open,
	onOpenChange,
	onSaved,
}: {
	grnId: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const detailQuery = useGrnDetailQuery(grnId, open);
	const detail = detailQuery.data?.success ? detailQuery.data.data : undefined;
	const grn = detail?.grn;
	const items = useMemo(() => detail?.items ?? [], [detail]);

	const [challanNo, setChallanNo] = useState("");
	const [challanDate, setChallanDate] = useState("");
	const [vehicleNo, setVehicleNo] = useState("");
	const [driverName, setDriverName] = useState("");
	const [driverPhone, setDriverPhone] = useState("");
	const [remarks, setRemarks] = useState("");
	const [arrivedQty, setArrivedQty] = useState<Record<number, string>>({});
	const updateMutation = useUpdateGrnMutation();

	// Seed form state from the fetched GRN exactly once per time the modal opens —
	// not on every `grn`/`items` reference change, or a background refetch (e.g. a
	// QA action posted against this same GRN while the modal is open) would silently
	// clobber whatever the user has already typed.
	const seededRef = useRef(false);
	useEffect(() => {
		if (!open) {
			seededRef.current = false;
			return;
		}
		if (!grn || seededRef.current) return;
		seededRef.current = true;

		setChallanNo(grn.challanNo ?? "");
		setChallanDate(grn.challanDate ?? "");
		setVehicleNo(grn.vehicleNo ?? "");
		setDriverName(grn.driverName ?? "");
		setDriverPhone(grn.driverPhone ?? "");
		setRemarks(grn.remarks ?? "");
		setArrivedQty(
			Object.fromEntries(
				items.map((item) => [item.id, String(item.receivedQty)]),
			),
		);
	}, [open, grn, items]);

	function onSubmit() {
		if (!grn) return;

		const changedLines = items
			.filter((item) => Number(arrivedQty[item.id] || 0) !== item.receivedQty)
			.map((item) => ({
				id: item.id,
				arrivedQty: Number(arrivedQty[item.id] || 0),
			}));

		updateMutation.mutate(
			{
				grnId: grn.id,
				challanNo: challanNo.trim() || null,
				challanDate: challanDate || null,
				vehicleNo: vehicleNo.trim() || null,
				driverName: driverName.trim() || null,
				driverPhone: driverPhone.trim() || null,
				remarks: remarks.trim() || null,
				lines: changedLines.length > 0 ? changedLines : undefined,
			},
			{
				onSuccess: (result) => {
					if (result.success) onSaved();
				},
			},
		);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="min-w-[min(56rem,calc(100vw-2rem))] gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>Edit {grn?.grnNumber ?? "GRN"} · draft</DialogTitle>
					<DialogDescription>
						Only legal while this GRN is still in draft.
					</DialogDescription>
				</DialogHeader>

				{detailQuery.isLoading || !grn ? (
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
										htmlFor="grn-edit-challan-no"
										className="mb-1 block text-xs font-medium"
									>
										Challan no
									</label>
									<Input
										id="grn-edit-challan-no"
										value={challanNo}
										onChange={(event) => setChallanNo(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-edit-challan-date"
										className="mb-1 block text-xs font-medium"
									>
										Challan date
									</label>
									<Input
										id="grn-edit-challan-date"
										type="date"
										value={challanDate}
										onChange={(event) => setChallanDate(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-edit-vehicle-no"
										className="mb-1 block text-xs font-medium"
									>
										Vehicle no
									</label>
									<Input
										id="grn-edit-vehicle-no"
										value={vehicleNo}
										onChange={(event) => setVehicleNo(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-edit-driver-name"
										className="mb-1 block text-xs font-medium"
									>
										Driver name
									</label>
									<Input
										id="grn-edit-driver-name"
										value={driverName}
										onChange={(event) => setDriverName(event.target.value)}
									/>
								</div>
								<div>
									<label
										htmlFor="grn-edit-driver-phone"
										className="mb-1 block text-xs font-medium"
									>
										Driver phone
									</label>
									<Input
										id="grn-edit-driver-phone"
										value={driverPhone}
										onChange={(event) => setDriverPhone(event.target.value)}
									/>
								</div>
							</div>

							<div>
								<label
									htmlFor="grn-edit-remarks"
									className="mb-1 block text-xs font-medium"
								>
									Remarks
								</label>
								<Textarea
									id="grn-edit-remarks"
									value={remarks}
									onChange={(event) => setRemarks(event.target.value)}
									placeholder="Optional"
								/>
							</div>

							<div className="space-y-2">
								{items.map((item) => (
									<div
										key={item.id}
										className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_8rem_8rem] md:items-center"
									>
										<div className="min-w-0">
											<span className="font-medium">{item.itemName}</span>
											<p className="text-xs text-muted-foreground">
												{item.itemSku}
											</p>
										</div>
										<div className="text-xs text-muted-foreground">
											<p className="text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase">
												Ordered
											</p>
											<p>{item.orderedQty}</p>
										</div>
										<div>
											<label
												htmlFor={`grn-edit-arrived-qty-${item.id}`}
												className="mb-1 block text-[10px] font-medium tracking-wide text-muted-foreground/70 uppercase"
											>
												Arrived qty
											</label>
											<Input
												id={`grn-edit-arrived-qty-${item.id}`}
												type="number"
												min={0}
												value={arrivedQty[item.id] ?? ""}
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
								disabled={updateMutation.isPending}
								onClick={onSubmit}
							>
								Save changes
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
