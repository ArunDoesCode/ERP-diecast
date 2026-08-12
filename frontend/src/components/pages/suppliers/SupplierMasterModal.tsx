"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { type Resolver, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import {
	type SupplierMasterInput,
	supplierMasterSchema,
	supplierTypeValues,
} from "@/types/suppliers";

const NO_TYPE_VALUE = "__none__";

const createSupplierFormSchema = supplierMasterSchema.extend({
	type: z.enum(supplierTypeValues, {
		error: "Supplier type is required",
	}),
	gstNumber: z.string().trim().min(1, "GST number is required"),
	panNumber: z.string().trim().min(1, "PAN number is required"),
	contactPerson: z.string().trim().min(1, "Contact person is required"),
	email: z
		.string()
		.trim()
		.min(1, "Email is required")
		.email("Enter a valid email"),
	phone: z.string().trim().min(1, "Phone is required"),
	address: z.string().trim().min(1, "Address is required"),
});

type SupplierMasterModalProps = {
	mode: "create" | "edit";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	submitLabel: string;
	defaultValues: SupplierMasterInput;
	isSubmitting: boolean;
	onSubmit: (values: SupplierMasterInput) => void;
};

export function SupplierMasterModal({
	mode,
	open,
	onOpenChange,
	title,
	description,
	submitLabel,
	defaultValues,
	isSubmitting,
	onSubmit,
}: SupplierMasterModalProps) {
	const resolver = useMemo(
		() =>
			zodResolver(
				mode === "create" ? createSupplierFormSchema : supplierMasterSchema,
			) as unknown as Resolver<SupplierMasterInput>,
		[mode],
	);

	const form = useForm<SupplierMasterInput>({
		resolver,
		defaultValues,
	});

	useEffect(() => {
		if (!open) return;
		form.reset(defaultValues);
	}, [open, defaultValues, form]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<Form {...form}>
				<DialogContent className="sm:max-w-2xl gap-0 p-0">
					<div className="flex max-h-[85vh] flex-col">
						<DialogHeader className="border-b px-6 py-5">
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1.5">
									<DialogTitle>{title}</DialogTitle>
									<DialogDescription>{description}</DialogDescription>
								</div>
							</div>
						</DialogHeader>

						<div className="flex-1 overflow-y-auto px-6 py-6">
							<form
								id="supplier-master-form"
								onSubmit={form.handleSubmit(onSubmit)}
								className="space-y-8"
							>
								<section className="space-y-4">
									<div className="flex items-center justify-between gap-2">
										<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
											Identity
										</h3>
										<FormField
											control={form.control}
											name="isActive"
											render={({ field }) => (
												<FormItem className="flex flex-row items-center gap-2 space-y-0">
													<FormLabel className="text-xs text-muted-foreground">
														Active
													</FormLabel>
													<FormControl>
														<Switch
															checked={field.value}
															onCheckedChange={field.onChange}
															aria-label="Toggle supplier active status"
														/>
													</FormControl>
												</FormItem>
											)}
										/>
									</div>

									<div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-name"
															label="Supplier name"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>

										<FormField
											control={form.control}
											name="type"
											render={({ field }) => (
												<FormItem>
													<FormLabel className="text-xs text-muted-foreground">
														Supplier type
													</FormLabel>
													<FormControl>
														<Select
															value={field.value ?? NO_TYPE_VALUE}
															onValueChange={(value) =>
																field.onChange(
																	value === NO_TYPE_VALUE ? undefined : value,
																)
															}
														>
															<SelectTrigger className="h-12 w-full rounded-lg px-3 text-base md:text-sm">
																<SelectValue placeholder="Select supplier type" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value={NO_TYPE_VALUE}>
																	None
																</SelectItem>
																{supplierTypeValues.map((value) => (
																	<SelectItem key={value} value={value}>
																		{value}
																	</SelectItem>
																))}
															</SelectContent>
														</Select>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								</section>

								<section className="space-y-4">
									<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										Compliance
									</h3>
									<div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
										<FormField
											control={form.control}
											name="gstNumber"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-gst"
															label="GST number"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="panNumber"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-pan"
															label="PAN number"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								</section>

								<section className="space-y-4">
									<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										Contact
									</h3>
									<div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
										<FormField
											control={form.control}
											name="contactPerson"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-contact"
															label="Contact person"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="phone"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-phone"
															label="Phone"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="email"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-email"
															label="Email"
															type="email"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="address"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															{...field}
															id="supplier-address"
															label="Address"
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								</section>

								<section className="space-y-4">
									<h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
										Terms
									</h3>
									<div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
										<FormField
											control={form.control}
											name="defaultPaymentTermsDays"
											render={({ field }) => (
												<FormItem className="min-h-19">
													<FormControl>
														<FloatingLabelInput
															id="supplier-payment"
															label="Default payment terms (days)"
															type="number"
															inputMode="numeric"
															name={field.name}
															value={field.value ?? ""}
															onBlur={field.onBlur}
															ref={field.ref}
															onChange={(event) => {
																const value = event.target.valueAsNumber;
																field.onChange(
																	Number.isNaN(value) ? undefined : value,
																);
															}}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
									</div>
								</section>
							</form>
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
								type="submit"
								form="supplier-master-form"
								disabled={isSubmitting}
							>
								{isSubmitting ? "Saving..." : submitLabel}
							</Button>
						</DialogFooter>
					</div>
				</DialogContent>
			</Form>
		</Dialog>
	);
}
