"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { type Resolver, useForm } from "react-hook-form";

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
	isValidGstin,
	panFromGstin,
	type SupplierMasterInput,
	supplierMasterSchema,
	supplierTypeValues,
} from "@/types/suppliers";

type SupplierMasterModalProps = {
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
				supplierMasterSchema,
			) as unknown as Resolver<SupplierMasterInput>,
		[],
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
															maxLength={200}
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
															value={field.value ?? "raw_material"}
															onValueChange={field.onChange}
														>
															<SelectTrigger className="h-12 w-full rounded-lg px-3 text-base md:text-sm">
																<SelectValue placeholder="Select supplier type" />
															</SelectTrigger>
															<SelectContent>
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
															value={field.value ?? ""}
															id="supplier-gst"
															label="GST number (optional)"
															maxLength={15}
															onChange={(event) => {
																const gst = event.target.value.toUpperCase();
																field.onChange(gst);
																if (isValidGstin(gst)) {
																	form.setValue(
																		"panNumber",
																		panFromGstin(gst),
																		{
																			shouldDirty: true,
																			shouldValidate: true,
																		},
																	);
																}
															}}
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
															value={field.value ?? ""}
															id="supplier-pan"
															label="PAN number (optional, filled from GST)"
															maxLength={10}
															onChange={(event) =>
																field.onChange(event.target.value.toUpperCase())
															}
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
															value={field.value ?? ""}
															id="supplier-contact"
															label="Contact person (optional)"
															maxLength={200}
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
															value={field.value ?? ""}
															id="supplier-phone"
															label="Phone (optional)"
															maxLength={30}
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
															value={field.value ?? ""}
															id="supplier-email"
															label="Email (optional)"
															maxLength={254}
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
															value={field.value ?? ""}
															id="supplier-address"
															label="Address (optional)"
															maxLength={500}
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
															label="Default payment terms (days, 0-365)"
															type="number"
															min={0}
															max={365}
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
