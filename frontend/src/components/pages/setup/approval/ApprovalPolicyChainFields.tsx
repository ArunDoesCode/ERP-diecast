"use client";

import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

import { EmployeeCombobox } from "@/components/pages/setup/shared/EmployeeCombobox";
import { Button } from "@/components/ui/button";
import {
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ApprovalPolicyFormInput } from "@/types/approval";
import type { Employee, Role } from "@/types/setup";

type ApprovalPolicyChainFieldsProps = {
	form: UseFormReturn<ApprovalPolicyFormInput>;
	chainFieldArray: UseFieldArrayReturn<
		ApprovalPolicyFormInput,
		"approvalChain"
	>;
	roles: Role[];
	onAddLevel: () => void;
	onRemoveLevel: (index: number) => void;
	onSelectEmployee: (index: number, employee: Employee) => void;
};

export function ApprovalPolicyChainFields({
	form,
	chainFieldArray,
	roles,
	onAddLevel,
	onRemoveLevel,
	onSelectEmployee,
}: ApprovalPolicyChainFieldsProps) {
	const chainValues = form.watch("approvalChain");

	return (
		<div className="space-y-3 pt-2">
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium">Approval Chain</p>
				<Button type="button" variant="outline" onClick={onAddLevel}>
					Add level
				</Button>
			</div>

			{chainFieldArray.fields.map((fieldRow, index) => {
				const level = chainValues[index];

				return (
					<div
						key={fieldRow.id}
						className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 md:grid-cols-4 border-t-red-200"
					>
						<div className="text-sm text-muted-foreground">
							Level {index + 1}
						</div>

						<FormField
							control={form.control}
							name={`approvalChain.${index}.approverType` as const}
							render={({ field }) => (
								<FormItem>
									<Select
										value={field.value}
										onValueChange={(value) => {
											field.onChange(value);
											form.setValue(`approvalChain.${index}.role`, "", {
												shouldDirty: true,
											});
											form.setValue(`approvalChain.${index}.employeeId`, null, {
												shouldDirty: true,
											});
											form.setValue(
												`approvalChain.${index}.employeeSearch`,
												"",
												{ shouldDirty: true },
											);
										}}
									>
										<FormControl>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Approver type" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="role">Role</SelectItem>
											<SelectItem value="specific">
												Specific employee
											</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{level?.approverType === "role" ? (
							<FormField
								control={form.control}
								name={`approvalChain.${index}.role` as const}
								render={({ field }) => (
									<FormItem>
										<Select
											value={field.value || "none"}
											onValueChange={(value) =>
												field.onChange(value === "none" ? "" : value)
											}
										>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select role" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="none">Select role</SelectItem>
												{roles.map((role) => (
													<SelectItem key={role.id} value={role.name}>
														{role.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						) : (
							<FormField
								control={form.control}
								name={`approvalChain.${index}.employeeSearch` as const}
								render={({ field }) => (
									<FormItem className="space-y-2 md:col-span-2">
										<FormControl>
											<EmployeeCombobox
												search={field.value}
												onSearchChange={field.onChange}
												onSelect={(employee) =>
													onSelectEmployee(index, employee)
												}
											/>
										</FormControl>
										{level?.employeeId ? (
											<p className="text-xs text-muted-foreground">
												Employee id: {level.employeeId}
											</p>
										) : null}
										<FormMessage />
									</FormItem>
								)}
							/>
						)}

						<div className="flex justify-end">
							<Button
								type="button"
								variant="ghost"
								disabled={chainFieldArray.fields.length === 1}
								onClick={() => onRemoveLevel(index)}
							>
								Remove
							</Button>
						</div>
					</div>
				);
			})}
		</div>
	);
}
