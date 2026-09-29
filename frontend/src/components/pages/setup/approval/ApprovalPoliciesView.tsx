"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { type Resolver, useFieldArray, useForm } from "react-hook-form";

import { SetupBackButton } from "@/components/pages/setup/shared/SetupBackButton";
import { Button } from "@/components/ui/button";
import {
	useApprovalPolicyDetailsQuery,
	useCreateApprovalPolicyMutation,
	useUpdateApprovalPolicyMutation,
} from "@/lib/api/approval/queries";
import { useRolesQuery } from "@/lib/api/setup/queries";
import {
	type ApprovalPolicyFormInput,
	approvalPolicyFormSchema,
} from "@/types/approval";
import type { Employee } from "@/types/setup";
import { ApprovalPolicyForm } from "./ApprovalPolicyForm";
import { ApprovalPolicyTable } from "./ApprovalPolicyTable";
import {
	createDefaultFormValues,
	mapPolicyToFormValues,
	type PolicyFormMode,
	toCreatePayload,
	toUpdatePayload,
} from "./approval-policy-helpers";

export function ApprovalPoliciesView() {
	const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null);

	const [formMode, setFormMode] = useState<PolicyFormMode | null>(null);
	// BR-APR-59: seed the edit form once per opened policy, so a background
	// refetch never wipes what the user has typed.
	const seededForRef = useRef<number | null>(null);

	const rolesQuery = useRolesQuery();
	const createPolicyMutation = useCreateApprovalPolicyMutation();
	const updatePolicyMutation = useUpdateApprovalPolicyMutation();

	const policyForm = useForm<ApprovalPolicyFormInput>({
		resolver: zodResolver(
			approvalPolicyFormSchema,
		) as unknown as Resolver<ApprovalPolicyFormInput>,
		defaultValues: createDefaultFormValues(),
	});

	const chainFieldArray = useFieldArray({
		control: policyForm.control,
		name: "approvalChain",
	});

	const policyDetailsQuery = useApprovalPolicyDetailsQuery(
		selectedPolicyId ?? undefined,
	);
	const policy = policyDetailsQuery.data?.data;

	const roles = rolesQuery.data?.data ?? [];
	const isFormPending =
		createPolicyMutation.isPending || updatePolicyMutation.isPending;

	function openCreateForm() {
		setFormMode("create");
		policyForm.reset(createDefaultFormValues());
	}

	function handleEditClick(id: number) {
		seededForRef.current = null;
		setSelectedPolicyId(id);
	}

	function closeForm() {
		seededForRef.current = null;
		setFormMode(null);
		setSelectedPolicyId(null);
		policyForm.reset(createDefaultFormValues());
	}

	function addChainLevel() {
		chainFieldArray.append({
			approverType: "role",
			role: "",
			employeeId: null,
			employeeSearch: "",
		});
	}

	function removeChainLevel(index: number) {
		chainFieldArray.remove(index);
	}

	function onSelectEmployee(index: number, employee: Employee) {
		policyForm.setValue(`approvalChain.${index}.employeeId`, employee.id, {
			shouldDirty: true,
		});
		policyForm.setValue(
			`approvalChain.${index}.employeeSearch`,
			employee.name,
			{ shouldDirty: true },
		);
	}

	function onSubmitPolicyForm(values: ApprovalPolicyFormInput) {
		if (formMode === "create") {
			createPolicyMutation.mutate(toCreatePayload(values), {
				onSuccess: closeForm,
			});
			return;
		}

		if (formMode === "edit" && selectedPolicyId) {
			updatePolicyMutation.mutate(
				{ id: selectedPolicyId, input: toUpdatePayload(values) },
				{ onSuccess: closeForm },
			);
		}
	}

	// BR-APR-57: open the edit form only after fresh details have loaded.
	useEffect(() => {
		if (
			selectedPolicyId !== null &&
			seededForRef.current !== selectedPolicyId &&
			policy &&
			policy.id === selectedPolicyId &&
			policyDetailsQuery.isSuccess &&
			!policyDetailsQuery.isFetching
		) {
			seededForRef.current = selectedPolicyId;
			setFormMode("edit");
			policyForm.reset(mapPolicyToFormValues(policy));
		}
	}, [
		selectedPolicyId,
		policy,
		policyDetailsQuery.isSuccess,
		policyDetailsQuery.isFetching,
		policyForm.reset,
	]);

	return (
		<div className="flex w-full flex-col gap-6 p-6">
			{formMode === null ? (
				<>
					<SetupBackButton />
					<ApprovalPolicyTable
						onCreate={openCreateForm}
						onEdit={handleEditClick}
					/>
				</>
			) : (
				<>
					<Button
						variant="ghost"
						onClick={closeForm}
						className="mb-2 w-fit text-muted-foreground hover:text-foreground"
					>
						<IconArrowLeft className="mr-2 size-4" />
						Back to Policies
					</Button>

					<ApprovalPolicyForm
						form={policyForm}
						mode={formMode}
						roles={roles}
						chainFieldArray={chainFieldArray}
						isPending={isFormPending}
						onSubmit={onSubmitPolicyForm}
						onCancel={closeForm}
						onAddLevel={addChainLevel}
						onRemoveLevel={removeChainLevel}
						onSelectEmployee={onSelectEmployee}
					/>
				</>
			)}
		</div>
	);
}
