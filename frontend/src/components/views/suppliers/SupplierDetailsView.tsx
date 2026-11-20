"use client";

import { IconArrowLeft, IconEdit } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SupplierHistoryCard } from "@/components/pages/suppliers/SupplierHistoryCard";
import { SupplierMasterModal } from "@/components/pages/suppliers/SupplierMasterModal";
import { SupplierOfferingsSection } from "@/components/pages/suppliers/SupplierOfferingsSection";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import {
	toSupplierMasterUpdatePayload,
	useSupplierDetailQuery,
	useUpdateSupplierMasterMutation,
} from "@/lib/api/suppliers/queries";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import type { Supplier, SupplierMasterInput } from "@/types/suppliers";

type SupplierDetailsViewProps = {
	supplierId: number;
};

function toMasterDefaultValues(supplier?: Supplier): SupplierMasterInput {
	if (!supplier) {
		return {
			name: "",
			type: "raw_material",
			gstNumber: "",
			panNumber: "",
			contactPerson: "",
			email: "",
			phone: "",
			address: "",
			defaultPaymentTermsDays: 0,
			isActive: true,
		};
	}

	return {
		name: supplier.name,
		type: (supplier.type ?? "raw_material") as SupplierMasterInput["type"],
		gstNumber: supplier.gstNumber ?? "",
		panNumber: supplier.panNumber ?? "",
		contactPerson: supplier.contactPerson ?? "",
		email: supplier.email ?? "",
		phone: supplier.phone ?? "",
		address: supplier.address ?? "",
		defaultPaymentTermsDays: supplier.defaultPaymentTermsDays ?? 0,
		isActive: supplier.isActive,
	};
}

function renderValue(value?: string | number | null) {
	if (value === null || value === undefined || value === "") return "–";
	return String(value);
}

export function SupplierDetailsView({ supplierId }: SupplierDetailsViewProps) {
	const router = useRouter();
	const [editOpen, setEditOpen] = useState(false);
	const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
	const canManage = useCan("supplier.manage");

	const detailQuery = useSupplierDetailQuery(supplierId);
	const updateMasterMutation = useUpdateSupplierMasterMutation();

	const supplier = detailQuery.data?.success
		? detailQuery.data.data.supplier
		: null;
	useBreadcrumbLast(supplier?.name);
	const defaultValues = useMemo(
		() => toMasterDefaultValues(supplier ?? undefined),
		[supplier],
	);

	if (detailQuery.isLoading) {
		return (
			<div className="flex w-full flex-col gap-4">
				<Skeleton className="h-10 w-44" />
				<Skeleton className="h-52 w-full" />
				<Skeleton className="h-72 w-full" />
			</div>
		);
	}

	if (detailQuery.isError || !supplier) {
		return (
			<div className="flex w-full flex-col gap-4">
				<Button
					variant="outline"
					className="w-fit"
					onClick={() => router.push("/suppliers")}
				>
					<IconArrowLeft className="size-4" />
					Back to suppliers
				</Button>

				<p className="text-sm text-destructive">
					Failed to load supplier details.
				</p>

				<Button
					type="button"
					variant="outline"
					className="w-fit"
					onClick={() => detailQuery.refetch()}
				>
					Retry
				</Button>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<DetailHeader
				docNo={supplier.name}
				status={
					<StatusBadge
						doc="supplier"
						status={supplier.isActive ? "active" : "inactive"}
					/>
				}
				meta={[
					{ label: "Type", value: renderValue(supplier.type) },
					{ label: "GST", value: renderValue(supplier.gstNumber) },
					{
						label: "Payment terms",
						value:
							supplier.defaultPaymentTermsDays != null
								? `${supplier.defaultPaymentTermsDays} days`
								: "–",
					},
				]}
				backHref="/suppliers"
				backLabel="suppliers"
				actions={
					canManage ? (
						<>
							<Button
								type="button"
								variant="outline"
								onClick={() => setStatusConfirmOpen(true)}
							>
								{supplier.isActive ? "Deactivate" : "Reactivate"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => setEditOpen(true)}
							>
								<IconEdit />
								Edit details
							</Button>
						</>
					) : undefined
				}
			/>

			<Card>
				<CardContent>
					<div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 md:grid-cols-3">
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								Supplier type
							</p>
							<p className="text-sm">{renderValue(supplier.type)}</p>
						</div>
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								GST number
							</p>
							<p className="text-sm">{renderValue(supplier.gstNumber)}</p>
						</div>
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								PAN number
							</p>
							<p className="text-sm">{renderValue(supplier.panNumber)}</p>
						</div>
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								Contact person
							</p>
							<p className="text-sm">{renderValue(supplier.contactPerson)}</p>
						</div>
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								Phone
							</p>
							<p className="text-sm">{renderValue(supplier.phone)}</p>
						</div>
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								Email
							</p>
							<p className="text-sm">{renderValue(supplier.email)}</p>
						</div>
						<div className="sm:col-span-2 md:col-span-3">
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								Address
							</p>
							<p className="text-sm">{renderValue(supplier.address)}</p>
						</div>
						<div>
							<p className="text-[13px] leading-[18px] font-semibold text-muted-foreground">
								Default payment terms
							</p>
							<p className="text-sm">
								{supplier.defaultPaymentTermsDays != null
									? `${supplier.defaultPaymentTermsDays} days`
									: "–"}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>

			<SupplierOfferingsSection supplierId={supplierId} canManage={canManage} />

			<SupplierHistoryCard supplierId={supplierId} />

			<AlertDialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{supplier.isActive
								? "Deactivate supplier?"
								: "Reactivate supplier?"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{supplier.isActive
								? "New purchase orders can no longer pick this supplier. Existing orders and history stay as they are."
								: "This supplier can be picked on new purchase orders again."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={updateMasterMutation.isPending}
							onClick={() =>
								updateMasterMutation.mutate({
									supplierId,
									payload: { mode: "master", isActive: !supplier.isActive },
								})
							}
						>
							{supplier.isActive ? "Deactivate" : "Reactivate"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<SupplierMasterModal
				open={editOpen}
				onOpenChange={setEditOpen}
				title="Edit supplier"
				description="Update supplier master details."
				submitLabel="Save changes"
				defaultValues={defaultValues}
				isSubmitting={updateMasterMutation.isPending}
				onSubmit={(values) => {
					updateMasterMutation.mutate(
						{
							supplierId,
							payload: toSupplierMasterUpdatePayload(values),
						},
						{
							onSuccess: (result) => {
								if (!result.success) return;
								setEditOpen(false);
							},
						},
					);
				}}
			/>
		</div>
	);
}
