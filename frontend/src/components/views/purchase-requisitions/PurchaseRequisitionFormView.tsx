"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";
import type { SearchableSelectOption } from "@/components/common/SearchableSelect";
import { CancelPurchaseRequisitionDialog } from "@/components/pages/purchase-requisitions/CancelPurchaseRequisitionDialog";
import {
	createDefaults,
	type LineEstimate,
	type LookupItemOption,
	mergeLookupItemOptions,
	PurchaseRequisitionForm,
	toLookupItemOptions,
} from "@/components/pages/purchase-requisitions/PurchaseRequisitionForm";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import {
	useActOnApprovalRequestMutation,
	useCurrentApprovalByDocQuery,
	useSubmitApprovalRequestMutation,
} from "@/lib/api/approval/queries";
import { useMachinesQuery } from "@/lib/api/asset/queries";
import { prErrorMessage } from "@/lib/api/purchase-requisitions/error-messages";
import {
	toPRCreatePayload,
	toPRUpdatePayload,
	useCreatePurchaseRequisitionMutation,
	usePurchaseRequisitionDetailQuery,
	useUpdatePurchaseRequisitionMutation,
} from "@/lib/api/purchase-requisitions/queries";
import { useAssetItemsLookupQuery } from "@/lib/api/suppliers/queries";
import { formatDocNo } from "@/lib/format";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import {
	type PRCreateFormInput,
	prCreateFormSchema,
} from "@/types/purchase-requisitions";

const LIST_HREF = "/purchase-requisitions";
const FORM_ID = "pr-form";

type Props = { mode: "new" } | { mode: "edit"; prId: number };

export function PurchaseRequisitionFormView(props: Props) {
	const router = useRouter();
	const prId = props.mode === "edit" ? props.prId : 0;
	const canManage = useCan("pr.manage");
	const canLinkMachine = useCan("pr.link_machine");
	const currentUserId = useAuthSessionStore((state) => state.userId);
	const isSuperAdmin = useAuthSessionStore((state) => state.isSuperAdmin);

	const [machineSearch, setMachineSearch] = useState("");
	const [itemSearch, setItemSearch] = useState("");
	const [serverError, setServerError] = useState<string | null>(null);
	const [cancelOpen, setCancelOpen] = useState(false);
	const [saving, setSaving] = useState<"save" | "submit" | null>(null);
	const [finished, setFinished] = useState(false);

	const detailQuery = usePurchaseRequisitionDetailQuery(
		prId,
		props.mode === "edit",
	);
	const createMutation = useCreatePurchaseRequisitionMutation();
	const updateMutation = useUpdatePurchaseRequisitionMutation();
	const submitMutation = useSubmitApprovalRequestMutation();
	const withdrawMutation = useActOnApprovalRequestMutation();

	const detail = detailQuery.data?.success ? detailQuery.data.data : null;
	const pr = detail?.pr ?? null;

	const form = useForm<PRCreateFormInput>({
		resolver: zodResolver(
			prCreateFormSchema,
		) as unknown as Resolver<PRCreateFormInput>,
		defaultValues: createDefaults(),
	});
	const fieldArray = useFieldArray({ control: form.control, name: "items" });

	// Seed once per PR: a background refetch must not wipe what the user typed.
	const seededFor = useRef<number | null>(null);
	useEffect(() => {
		if (!pr || !detail || seededFor.current === pr.id) return;
		seededFor.current = pr.id;
		form.reset({
			type: pr.type,
			assetId: pr.assetId ?? undefined,
			notes: pr.notes ?? "",
			items:
				detail.items.length > 0
					? detail.items.map((item) => ({
							id: item.id,
							itemId: item.itemId,
							requestedQty: item.requestedQty,
							uom: item.uom ?? "",
							expectedDate: item.expectedDate?.slice(0, 10) ?? "",
						}))
					: createDefaults().items,
		});
	}, [pr, detail, form]);

	useUnsavedChangesGuard(form.formState.isDirty && !finished);

	const itemLookup = useAssetItemsLookupQuery(itemSearch, 20);
	const machineQuery = useMachinesQuery({
		page: 1,
		pageSize: 20,
		q: machineSearch || undefined,
	});

	const machineOptions = useMemo(
		() =>
			(machineQuery.data?.data ?? []).map<SearchableSelectOption>((m) => ({
				value: String(m.id),
				label: m.name,
				secondaryLabel: m.type ?? "No type",
			})),
		[machineQuery.data?.data],
	);
	const itemOptions = useMemo(() => {
		const fetched =
			itemLookup.data?.pages.flatMap((page) =>
				toLookupItemOptions(page.data),
			) ?? [];
		const saved =
			detail?.items.map<LookupItemOption>((item) => ({
				value: String(item.itemId),
				label: item.itemName ?? `Item ${item.itemId}`,
				secondaryLabel:
					item.uom && item.itemSku
						? `${item.uom} - ${item.itemSku}`
						: (item.uom ?? item.itemSku ?? ""),
			})) ?? [];
		return mergeLookupItemOptions(saved, fetched) as SearchableSelectOption[];
	}, [itemLookup.data, detail?.items]);

	const lineEstimates = useMemo(() => {
		const map: Record<number, LineEstimate> = {};
		for (const item of detail?.items ?? []) {
			if (item.estRatePaise == null) continue;
			map[item.id] = {
				ratePaise: item.estRatePaise,
				amountPaise: Math.round(item.estRatePaise * item.requestedQty),
			};
		}
		return map;
	}, [detail?.items]);

	const isRequester =
		props.mode === "new" ||
		(pr != null &&
			currentUserId != null &&
			String(pr.requestedBy) === currentUserId);
	// BR-PR-17: draft edit by the requester or super-admin; BR-FF-47: submit only the creator.
	const canEdit =
		props.mode === "new" ||
		(pr?.status === "draft" && (isRequester || isSuperAdmin));
	const canWithdraw = pr?.status === "pending_approval" && isRequester;
	const currentApproval = useCurrentApprovalByDocQuery(
		canWithdraw ? "pr" : undefined,
		canWithdraw ? pr?.id : undefined,
	);
	const openRequestId = currentApproval.data?.success
		? (currentApproval.data.data?.id ?? null)
		: null;
	const busy =
		saving != null || withdrawMutation.isPending || cancelOpen === true;

	async function save(action: "save" | "submit") {
		const valid = await form.trigger();
		if (!valid) return;
		const values = form.getValues();
		setServerError(null);
		setSaving(action);

		let savedId: number;
		try {
			if (props.mode === "new") {
				const result = await createMutation.mutateAsync(
					toPRCreatePayload({
						type: values.type,
						notes: values.notes,
						assetId: canLinkMachine ? values.assetId : undefined,
						items: values.items,
					}),
				);
				if (!result.success) {
					setServerError(result.message);
					setSaving(null);
					return;
				}
				savedId = result.data.id;
			} else {
				if (!pr || !detail) return;
				const result = await updateMutation.mutateAsync(
					toPRUpdatePayload({
						prId,
						type: pr.type,
						saleOrderId: pr.saleOrderId,
						assetId: pr.assetId,
						originalAssetId: pr.assetId,
						notes: values.notes,
						originalItems: detail.items.map((item) => ({
							id: item.id,
							itemId: item.itemId,
							requestedQty: item.requestedQty,
							expectedDate: item.expectedDate ?? undefined,
						})),
						items: values.items,
					}),
				);
				if (!result.success) {
					setServerError(result.message);
					setSaving(null);
					return;
				}
				savedId = prId;
			}
		} catch (error) {
			// BR-FF-56: nothing submitted, form stays with what was typed.
			setServerError(
				prErrorMessage(error, "The requisition could not be saved."),
			);
			setSaving(null);
			return;
		}

		// Saved: the guard must not ask on the way out.
		setFinished(true);
		if (action === "submit") {
			try {
				// A refusal toasts its reason (hook); BR-FF-57: draft stays saved.
				await submitMutation.mutateAsync({ docType: "pr", docId: savedId });
			} catch {
				// handled by the mutation's error toast
			}
		}
		// The PR page arrives with sub-feature 3; until then the list.
		router.push(LIST_HREF);
	}

	function onWithdraw() {
		if (openRequestId == null) return;
		withdrawMutation.mutate(
			{ id: openRequestId, input: { action: "withdraw" } },
			{
				onSuccess: (result) => {
					if (result.success) router.push(LIST_HREF);
				},
			},
		);
	}

	const title =
		props.mode === "new"
			? "New purchase requisition"
			: pr
				? `Purchase requisition ${formatDocNo(pr.prNumber)}`
				: "Purchase requisition";

	if (!canManage) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title={title} />
				<p className="text-sm text-muted-foreground">
					You do not have access to raise requisitions.{" "}
					<Link href={LIST_HREF} className="text-brand-accent hover:underline">
						Back to the list
					</Link>
				</p>
			</div>
		);
	}

	if (props.mode === "edit") {
		if (detailQuery.isLoading) {
			return (
				<div className="flex flex-col gap-4">
					<PageHeader title={title} />
					<Skeleton className="h-9 w-full" />
					<Skeleton className="h-48 w-full" />
				</div>
			);
		}
		if (detailQuery.isError || !detail || !pr) {
			const notFound = detailQuery.data && !detailQuery.data.success;
			return (
				<div className="flex flex-col gap-4">
					<PageHeader title={title} />
					{notFound ? (
						<p className="text-sm text-muted-foreground">
							This requisition does not exist.{" "}
							<Link
								href={LIST_HREF}
								className="text-brand-accent hover:underline"
							>
								Back to the list
							</Link>
						</p>
					) : (
						<ErrorState
							message="The requisition could not be loaded."
							onRetry={() => {
								void detailQuery.refetch();
							}}
							retrying={detailQuery.isRefetching}
						/>
					)}
				</div>
			);
		}
	}

	const canCancel =
		pr != null && pr.status !== "cancelled" && (isRequester || isSuperAdmin);

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title={title}
				description={
					props.mode === "new"
						? "A new requisition starts as a draft."
						: canEdit
							? "Change the draft, or send it for approval."
							: pr && !isRequester && !isSuperAdmin
								? "Only the requester can change this requisition."
								: "Only a draft can be changed."
				}
				actions={
					<>
						{pr ? <StatusBadge doc="pr" status={pr.status} /> : null}
						<Button variant="outline" size="sm" asChild>
							<Link href={LIST_HREF}>Cancel</Link>
						</Button>
						{canEdit ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={busy}
								onClick={() => void save("save")}
							>
								{saving === "save" ? "Saving…" : "Save draft"}
							</Button>
						) : null}
						{canEdit && isRequester ? (
							<Button
								type="button"
								size="sm"
								disabled={busy}
								onClick={() => void save("submit")}
							>
								{saving === "submit" ? "Saving…" : "Save and submit"}
							</Button>
						) : null}
						{canWithdraw ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={busy || openRequestId == null}
								onClick={onWithdraw}
							>
								{withdrawMutation.isPending ? "Withdrawing…" : "Withdraw"}
							</Button>
						) : null}
						{canCancel ? (
							<Button
								type="button"
								variant="destructive"
								size="sm"
								disabled={busy}
								onClick={() => setCancelOpen(true)}
							>
								Cancel PR
							</Button>
						) : null}
					</>
				}
			/>

			<Form {...form}>
				<PurchaseRequisitionForm
					form={form}
					fieldArray={fieldArray}
					formId={FORM_ID}
					onSubmit={(event) => {
						event.preventDefault();
						if (canEdit) void save("save");
					}}
					readOnly={!canEdit}
					typeLocked={props.mode === "edit"}
					canLinkMachine={canLinkMachine}
					machineOptions={machineOptions}
					machineSearch={machineSearch}
					onMachineSearchChange={setMachineSearch}
					machinesLoading={machineQuery.isLoading}
					itemOptions={itemOptions}
					itemSearch={itemSearch}
					onItemSearchChange={setItemSearch}
					itemsLoading={itemLookup.isLoading}
					hasNextPage={itemLookup.hasNextPage}
					isFetchingNextPage={itemLookup.isFetchingNextPage}
					onReachEnd={() => {
						void itemLookup.fetchNextPage();
					}}
					lineEstimates={lineEstimates}
					estimatePaise={pr?.estimatedAmountPaise ?? null}
					noCostHistoryNames={(detail?.items ?? [])
						.filter((item) => item.noCostHistory)
						.map((item) => item.itemName ?? `Item ${item.itemId}`)}
					serverError={serverError}
				/>
			</Form>

			{pr ? (
				<CancelPurchaseRequisitionDialog
					prId={pr.id}
					prNumber={pr.prNumber}
					open={cancelOpen}
					onOpenChange={setCancelOpen}
					onCancelled={() => {
						setFinished(true);
						router.push(LIST_HREF);
					}}
				/>
			) : null}
		</div>
	);
}
