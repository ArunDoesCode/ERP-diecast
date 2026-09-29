"use client";

import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FloatingLabelInput } from "@/components/ui/floating-label";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type {
	ApprovalPolicyFormInput,
	ApprovalPolicyPrType,
} from "@/types/approval";
import type { Employee, Role } from "@/types/setup";
import { ApprovalPolicyChainFields } from "./ApprovalPolicyChainFields";
import type { PolicyFormMode } from "./approval-policy-helpers";

type ApprovalPolicyFormProps = {
	form: UseFormReturn<ApprovalPolicyFormInput>;
	mode: PolicyFormMode;
	roles: Role[];
	chainFieldArray: UseFieldArrayReturn<
		ApprovalPolicyFormInput,
		"approvalChain"
	>;
	isPending: boolean;
	onSubmit: (values: ApprovalPolicyFormInput) => void;
	onCancel: () => void;
	onAddLevel: () => void;
	onRemoveLevel: (index: number) => void;
	onSelectEmployee: (index: number, employee: Employee) => void;
};

export function ApprovalPolicyForm({
	form,
	mode,
	roles,
	chainFieldArray,
	isPending,
	onSubmit,
	onCancel,
	onAddLevel,
	onRemoveLevel,
	onSelectEmployee,
}: ApprovalPolicyFormProps) {
	const autoApprove = form.watch("autoApprove");

	return (
		<Card className="relative">
			<CardHeader className="gap-2">
				<CardTitle>
					{mode === "create" ? "Create Policy" : "Edit Policy"}
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-2">
				<Form {...form}>
					<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
						{/* isActive */}
						<div className="absolute right-0 top-0 p-4">
							<FormField
								control={form.control}
								name="isActive"
								render={({ field }) => (
									<FormItem className="flex items-center gap-2">
										<FormControl>
											<Switch
												checked={field.value}
												onCheckedChange={field.onChange}
											/>
										</FormControl>
										<span className="text-sm">Active</span>
									</FormItem>
								)}
							/>
						</div>

						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							{/* poliy name and auto approve */}
							<div className="relative">
								{/* policy name */}
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem className="min-h-19">
											<FormControl>
												<FloatingLabelInput
													id="approval-policy-name"
													label="Policy name"
													{...field}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								{/* Auto-approve */}
								<FormField
									control={form.control}
									name="autoApprove"
									render={({ field }) => (
										<FormItem className="absolute bottom-0 flex items-center justify-center gap-2">
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
											<span className="text-sm">Auto approve</span>
										</FormItem>
									)}
								/>
							</div>

							<FormField
								control={form.control}
								name="priority"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<FloatingLabelInput
												id="approval-policy-priority"
												label="Priority"
												type="number"
												min={1}
												name={field.name}
												value={field.value}
												onBlur={field.onBlur}
												ref={field.ref}
												onChange={(event) => field.onChange(event.target.value)}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{/* docType */}
							<FormField
								control={form.control}
								name="docType"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormLabel htmlFor="approval-policy-doc-type">
											Doc type
										</FormLabel>
										<Select
											value={field.value}
											onValueChange={field.onChange}
											disabled={mode === "edit"}
										>
											<FormControl>
												<SelectTrigger
													id="approval-policy-doc-type"
													className="w-full"
												>
													<SelectValue placeholder="Doc type" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="pr">PR</SelectItem>
												<SelectItem value="po">PO</SelectItem>
												<SelectItem value="sco">SCO</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							{/* subDocType */}
							<FormField
								control={form.control}
								name="subDocType"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormLabel htmlFor="approval-policy-sub-doc-type">
											Sub Doc Type (optional)
										</FormLabel>
										<Select
											value={field.value || "none"}
											onValueChange={(value) =>
												field.onChange(
													value === "none"
														? ""
														: (value as ApprovalPolicyPrType),
												)
											}
										>
											<FormControl>
												<SelectTrigger
													id="approval-policy-sub-doc-type"
													className="w-full"
												>
													<SelectValue placeholder="Sub Doc Type (optional)" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												<SelectItem value="any">Any</SelectItem>
												<SelectItem value="sale_order">Sale Order</SelectItem>
												<SelectItem value="stock_reorder">
													Stock Reorder
												</SelectItem>
												<SelectItem value="maintenance">Maintenance</SelectItem>
												<SelectItem value="tooling">Tooling</SelectItem>
												<SelectItem value="subcontracting">
													Subcontracting
												</SelectItem>
												<SelectItem value="misc">Misc</SelectItem>
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							{/* minAmountPaise */}
							<FormField
								control={form.control}
								name="minAmountPaise"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<FloatingLabelInput
												id="approval-policy-min-amount"
												label="Min amount (₹)"
												type="number"
												min={0}
												step="0.01"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{/* maxAmountPaise */}
							<FormField
								control={form.control}
								name="maxAmountPaise"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<FloatingLabelInput
												id="approval-policy-max-amount"
												label="Max amount (₹)"
												type="number"
												min={0}
												step="0.01"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							{/* description */}
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormLabel htmlFor="approval-policy-description">
											Description
										</FormLabel>
										<FormControl>
											<Textarea
												id="approval-policy-description"
												placeholder="Description"
												className="max-h-18"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						{!autoApprove ? (
							<ApprovalPolicyChainFields
								form={form}
								chainFieldArray={chainFieldArray}
								roles={roles}
								onAddLevel={onAddLevel}
								onRemoveLevel={onRemoveLevel}
								onSelectEmployee={onSelectEmployee}
							/>
						) : null}
						<div className="flex items-center justify-end gap-2">
							<Button type="button" variant="outline" onClick={onCancel}>
								Cancel
							</Button>
							<Button type="submit" disabled={isPending}>
								{mode === "create" ? "Create Policy" : "Update Policy"}
							</Button>
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
