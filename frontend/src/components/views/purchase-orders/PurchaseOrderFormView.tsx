"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import {
	type PoFormValues,
	PurchaseOrderForm,
	poLineValuePaise,
} from "@/components/pages/purchase-orders/PurchaseOrderForm";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan } from "@/hooks/use-can";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { useSubmitApprovalRequestMutation } from "@/lib/api/approval/queries";
import { useDocumentPanelQuery } from "@/lib/api/document/queries";
import {
	usePurchaseOrderDetailQuery,
	useUpdatePurchaseOrderMutation,
} from "@/lib/api/purchase-orders/queries";
import { prErrorMessage } from "@/lib/api/purchase-requisitions/error-messages";
import { formatDocNo } from "@/lib/format";
import { useAuthSessionStore } from "@/lib/store/auth-session-store";
import type { PurchaseOrderDetailPayload } from "@/types/purchase-orders";

const LIST_HREF = "/purchase-orders";
const FORM_ID = "po-form";

function seedValues(detail: PurchaseOrderDetailPayload): PoFormValues {
	const { po, items } = detail;
	return {
		paymentTermsDays:
			po.paymentTermsDays != null ? String(po.paymentTermsDays) : "",
		deliveryTerms: po.deliveryTerms ?? "",
		expectedDeliveryDate: po.expectedDeliveryDate ?? "",
		notes: po.notes ?? "",
		rates: Object.fromEntries(
			items.map((i) => [i.id, String(i.unitPricePaise / 100)]),
		),
		gsts: Object.fromEntries(
			items.map((i) => [i.id, String(i.gstPercent ?? 0)]),
		),
	};
}

/** Full-page draft order form (screen 8; BR-FF-46, 47, 56, 57, 111, 112). */
export function PurchaseOrderFormView({ poId }: { poId: number }) {
	const router = useRouter();
	const canManage = useCan("po.manage");
	const currentUserId = useAuthSessionStore((s) => s.userId);
	const isSuperAdmin = useAuthSessionStore((s) => s.isSuperAdmin);

	const detailQuery = usePurchaseOrderDetailQuery(poId, true);
	const panelQuery = useDocumentPanelQuery("po", poId);
	const quietSave = useRef(false);
	const updateMutation = useUpdatePurchaseOrderMutation(quietSave);
	const submitMutation = useSubmitApprovalRequestMutation();

	const detail = detailQuery.data?.success ? detailQuery.data.data : null;
	const po = detail?.po ?? null;
	const items = useMemo(() => detail?.items ?? [], [detail]);

	// Seed once per PO: a background refetch must not wipe what the user typed.
	const [draft, setDraft] = useState<{
		poId: number;
		values: PoFormValues;
		snapshot: string;
	} | null>(null);
	if (detail && draft?.poId !== detail.po.id) {
		const values = seedValues(detail);
		setDraft({ poId: detail.po.id, values, snapshot: JSON.stringify(values) });
	}
	const values = draft?.values ?? null;

	const [serverError, setServerError] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<number, string>>({});
	const [saving, setSaving] = useState<"save" | "submit" | null>(null);
	const [finished, setFinished] = useState(false);

	const dirty =
		draft != null && JSON.stringify(draft.values) !== draft.snapshot;
	useUnsavedChangesGuard(dirty && !finished);

	const totals = useMemo(() => {
		let subtotalPaise = 0;
		let taxPaise = 0;
		if (values) {
			for (const item of items) {
				const value = poLineValuePaise(item, values.rates[item.id] ?? "");
				subtotalPaise += value;
				taxPaise += Math.round(
					(value * Number(values.gsts[item.id] || 0)) / 100,
				);
			}
		}
		return { subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
	}, [items, values]);

	const panel = panelQuery.data?.success ? panelQuery.data.data : null;
	const linkedPr = panel?.linked.find((d) => d.docType === "pr");

	const isCreator =
		po != null &&
		currentUserId != null &&
		String(po.createdBy) === currentUserId;
	const canEdit = po?.status === "draft" && (isCreator || isSuperAdmin);
	const title = po
		? `Purchase order ${formatDocNo(po.poNumber)}`
		: "Purchase order";
	const busy = saving != null;

	async function save(action: "save" | "submit") {
		if (!po || !values) return;
		// BR-FF-56: a rate problem stays at the field, nothing is saved.
		const nextErrors: Record<number, string> = {};
		for (const item of items) {
			const rate = Number(values.rates[item.id] || 0);
			if (!(Math.round(rate * 100) >= 1)) nextErrors[item.id] = "Enter a rate";
		}
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) return;

		setServerError(null);
		setSaving(action);
		quietSave.current = action === "submit";

		const updates = items
			.filter(
				(item) =>
					Math.round(Number(values.rates[item.id] || 0) * 100) !==
						item.unitPricePaise ||
					Number(values.gsts[item.id] ?? 0) !== (item.gstPercent ?? 0),
			)
			.map((item) => ({
				id: item.id,
				unitPricePaise: Math.round(Number(values.rates[item.id] || 0) * 100),
				gstPercent: Number(values.gsts[item.id] ?? 0),
			}));

		try {
			const result = await updateMutation.mutateAsync({
				payload: {
					poId: po.id,
					paymentTermsDays: values.paymentTermsDays
						? Number(values.paymentTermsDays)
						: null,
					deliveryTerms: values.deliveryTerms.trim() || null,
					notes: values.notes.trim() || null,
					expectedDeliveryDate: values.expectedDeliveryDate || null,
					updates,
					deletes: [],
					inserts: [],
				},
			});
			if (!result.success) {
				setServerError(result.message);
				setSaving(null);
				return;
			}
		} catch (error) {
			setServerError(prErrorMessage(error, "The order could not be saved."));
			setSaving(null);
			return;
		}

		// Saved: the guard must not ask on the way out.
		setFinished(true);
		if (action === "submit") {
			try {
				// A refusal toasts its reason; BR-FF-57: the draft stays saved.
				await submitMutation.mutateAsync({ docType: "po", docId: po.id });
			} catch {
				// handled by the mutation's error toast
			}
		}
		router.push(`${LIST_HREF}/${po.id}`);
	}

	if (!canManage) {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title={title} />
				<p className="text-sm text-muted-foreground">
					You do not have access to edit purchase orders.{" "}
					<Link href={LIST_HREF} className="text-brand-accent hover:underline">
						Back to the list
					</Link>
				</p>
			</div>
		);
	}

	if (detailQuery.isLoading) {
		return (
			<div className="flex flex-col gap-4" aria-busy="true">
				<PageHeader title={title} />
				<Skeleton className="h-9 w-full" />
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	if (detailQuery.isError || !detail || !po || !values) {
		const notFound = detailQuery.data && !detailQuery.data.success;
		return (
			<div className="flex flex-col gap-4">
				<PageHeader title={title} />
				{notFound ? (
					<p className="text-sm text-muted-foreground">
						This order does not exist.{" "}
						<Link
							href={LIST_HREF}
							className="text-brand-accent hover:underline"
						>
							Back to the list
						</Link>
					</p>
				) : (
					<ErrorState
						message="The order could not be loaded."
						onRetry={() => {
							void detailQuery.refetch();
						}}
						retrying={detailQuery.isRefetching}
					/>
				)}
			</div>
		);
	}

	if (po.status !== "draft") {
		return (
			<div className="flex flex-col gap-4">
				<PageHeader
					title={title}
					actions={<StatusBadge doc="po" status={po.status} />}
				/>
				<p className="text-sm text-muted-foreground">
					Only a draft order can be changed.{" "}
					<Link
						href={`${LIST_HREF}/${po.id}`}
						className="text-brand-accent hover:underline"
					>
						Back to the order
					</Link>
				</p>
			</div>
		);
	}

	return (
		<div className="flex w-full flex-col gap-4">
			<PageHeader
				title={title}
				description={
					canEdit
						? "Change the draft, or send it for approval."
						: "Only the person who made this order can change it."
				}
				actions={
					<>
						<StatusBadge doc="po" status={po.status} />
						<Button variant="outline" size="sm" asChild>
							<Link href={`${LIST_HREF}/${po.id}`}>Cancel</Link>
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
						{canEdit && isCreator ? (
							<Button
								type="button"
								size="sm"
								disabled={busy}
								onClick={() => void save("submit")}
							>
								{saving === "submit" ? "Saving…" : "Save and submit"}
							</Button>
						) : null}
					</>
				}
			/>
			<PurchaseOrderForm
				formId={FORM_ID}
				onSubmit={(event) => {
					event.preventDefault();
					if (canEdit && !busy) void save("save");
				}}
				serverError={serverError}
				supplierName={po.supplierName}
				values={values}
				onChange={(next) =>
					setDraft((current) =>
						current ? { ...current, values: next } : current,
					)
				}
				items={items}
				errors={errors}
				totals={totals}
				prLink={
					linkedPr
						? {
								id: linkedPr.id,
								number: linkedPr.number,
								canOpen: linkedPr.canOpen,
							}
						: null
				}
			/>
		</div>
	);
}
