import type {
	ApprovalPolicyChainLevelInput,
	ApprovalPolicyCreateInput,
	ApprovalPolicyDetails,
	ApprovalPolicyFormInput,
	ApprovalPolicyUpdateInput,
} from "@/types/approval";

export type ActiveFilter = "all" | "active" | "inactive";
export type PolicyFormMode = "create" | "edit";

export function toAmountLabel(min: number | null, max: number | null) {
	if (min == null && max == null) return "Any";
	if (min != null && max != null) return `>= ${min} and < ${max}`;
	if (min != null) return `>= ${min}`;
	return `< ${max}`;
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
		minAmountPaise:
			policy.minAmountPaise == null ? "" : String(policy.minAmountPaise),
		maxAmountPaise:
			policy.maxAmountPaise == null ? "" : String(policy.maxAmountPaise),
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
	const min = form.minAmountPaise.trim();
	const max = form.maxAmountPaise.trim();

	return {
		name: form.name,
		description: form.description || undefined,
		isActive: form.isActive,
		priority: form.priority,
		docType: form.docType,
		// isSaleOrderLinked is intentionally not sent until the approval spec decides
		// whether policies filter on it (BL-002); backend then stores null = any.
		subDocType: form.subDocType || undefined,
		minAmountPaise: min ? Number(min) : undefined,
		maxAmountPaise: max ? Number(max) : undefined,
		autoApprove: form.autoApprove,
		approvalChain: form.autoApprove ? [] : toChainPayload(form.approvalChain),
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
		minAmountPaise: form.minAmountPaise.trim()
			? Number(form.minAmountPaise)
			: null,
		maxAmountPaise: form.maxAmountPaise.trim()
			? Number(form.maxAmountPaise)
			: null,
		autoApprove: form.autoApprove,
		approvalChain: form.autoApprove ? [] : toChainPayload(form.approvalChain),
	};
}
