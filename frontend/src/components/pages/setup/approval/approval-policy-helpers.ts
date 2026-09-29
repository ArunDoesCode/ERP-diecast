import type {
	ApprovalPolicyChainLevelInput,
	ApprovalPolicyCreateInput,
	ApprovalPolicyDetails,
	ApprovalPolicyFormInput,
	ApprovalPolicyUpdateInput,
} from "@/types/approval";

export type ActiveFilter = "all" | "active" | "inactive";
export type PolicyFormMode = "create" | "edit";

// BL-025: the form works in rupees, the API in integer paise.
export function paiseToRupeesInput(paise: number | null): string {
	return paise == null ? "" : String(paise / 100);
}

export function rupeesInputToPaise(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	return Math.round(Number(trimmed) * 100);
}

function rupees(paise: number) {
	return `₹${(paise / 100).toLocaleString("en-IN", {
		maximumFractionDigits: 2,
	})}`;
}

export function toAmountLabel(min: number | null, max: number | null) {
	if (min == null && max == null) return "Any";
	if (min != null && max != null)
		return `>= ${rupees(min)} and < ${rupees(max)}`;
	if (min != null) return `>= ${rupees(min)}`;
	return `< ${rupees(max as number)}`;
}

export function createDefaultFormValues(): ApprovalPolicyFormInput {
	return {
		name: "",
		description: "",
		isActive: true,
		priority: 1,
		docType: "pr",
		subDocType: "",
		minAmountPaise: "",
		maxAmountPaise: "",
		autoApprove: false,
		approvalChain: [
			{
				approverType: "role",
				role: "",
				employeeId: null,
				employeeSearch: "",
			},
		],
	};
}

export function mapPolicyToFormValues(
	policy: ApprovalPolicyDetails,
): ApprovalPolicyFormInput {
	return {
		name: policy.name,
		description: policy.description ?? "",
		isActive: policy.isActive,
		priority: policy.priority,
		docType: policy.docType,
		subDocType: policy.subDocType ?? "",
		minAmountPaise: paiseToRupeesInput(policy.minAmountPaise),
		maxAmountPaise: paiseToRupeesInput(policy.maxAmountPaise),
		autoApprove: policy.autoApprove,
		approvalChain:
			policy.approvalChain?.length > 0
				? policy.approvalChain.map((level) => ({
						approverType: level.approverType,
						role: level.role ?? "",
						employeeId: level.employeeId,
						employeeSearch: "",
					}))
				: [
						{
							approverType: "role",
							role: "",
							employeeId: null,
							employeeSearch: "",
						},
					],
	};
}

export function toChainPayload(
	levels: ApprovalPolicyFormInput["approvalChain"],
): ApprovalPolicyChainLevelInput[] {
	return levels.map((level, index) => {
		const base = { level: index + 1, approverType: level.approverType };

		// Send only the key the backend expects for this approverType; omit the
		// other entirely (null keys fail request validation before role/employee
		// checks run).
		if (level.approverType === "role") {
			return { ...base, role: level.role || undefined };
		}
		return { ...base, employeeId: level.employeeId ?? undefined };
	});
}

export function toCreatePayload(
	form: ApprovalPolicyFormInput,
): ApprovalPolicyCreateInput {
	const min = rupeesInputToPaise(form.minAmountPaise);
	const max = rupeesInputToPaise(form.maxAmountPaise);

	return {
		name: form.name,
		description: form.description || undefined,
		isActive: form.isActive,
		priority: form.priority,
		docType: form.docType,
		subDocType: form.subDocType || undefined,
		minAmountPaise: min ?? undefined,
		maxAmountPaise: max ?? undefined,
		autoApprove: form.autoApprove,
		// Auto-approve: chain is optional, send none.
		...(form.autoApprove
			? {}
			: { approvalChain: toChainPayload(form.approvalChain) }),
	};
}

export function toUpdatePayload(
	form: ApprovalPolicyFormInput,
): ApprovalPolicyUpdateInput {
	return {
		name: form.name,
		description: form.description || null,
		isActive: form.isActive,
		priority: form.priority,
		subDocType: form.subDocType || "any",
		minAmountPaise: rupeesInputToPaise(form.minAmountPaise),
		maxAmountPaise: rupeesInputToPaise(form.maxAmountPaise),
		autoApprove: form.autoApprove,
		approvalChain: form.autoApprove ? [] : toChainPayload(form.approvalChain),
	};
}
