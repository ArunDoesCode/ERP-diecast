"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { IconCurrencyRupee } from "@tabler/icons-react";
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
	FormMessage,
} from "@/components/ui/form";
import { useMarkPoInvoicedMutation } from "@/lib/api/purchase-orders/queries";
import {
	type MarkPoInvoicedFormInput,
	markPoInvoicedSchema,
} from "@/types/purchase-orders";

export function MarkPoInvoicedDialog({
	poId,
	poNumber,
	open,
	onOpenChange,
	onInvoiced,
}: {
	poId: number;
	poNumber: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onInvoiced: () => void;
}) {
	const mutation = useMarkPoInvoicedMutation();

	const form = useForm<MarkPoInvoicedFormInput>({
		// ponytail: markPoInvoicedSchema uses z.coerce for billedAmountRupees, so
		// zodResolver's inferred input type diverges from the output type — cast is
		// the documented workaround for zod4 + @hookform/resolvers coerced schemas
		resolver: zodResolver(
			markPoInvoicedSchema,
		) as unknown as Resolver<MarkPoInvoicedFormInput>,
		defaultValues: {
			invoiceNumber: "",
			invoiceDate: "",
			billedAmountRupees: 0,
			dueDate: "",
		},
	});

	function onSubmit(values: MarkPoInvoicedFormInput) {
		mutation.mutate(
			{ poId, payload: values },
			{
				onSuccess: (result) => {
					if (result.success) {
						form.reset();
						onInvoiced();
					}
				},
			},
		);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) form.reset();
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="gap-0 p-0">
				<DialogHeader className="border-b px-6 py-5">
					<DialogTitle>Mark {poNumber} as invoiced</DialogTitle>
					<DialogDescription>
						Record the supplier invoice details for this fully received PO.
					</DialogDescription>
				</DialogHeader>

				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)}>
						<div className="space-y-4 px-6 py-5">
							<FormField
								control={form.control}
								name="invoiceNumber"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<FloatingLabelInput
												{...field}
												id="invoiceNumber"
												label="Invoice number"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="invoiceDate"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<FloatingLabelInput
												{...field}
												id="invoiceDate"
												label="Invoice date"
												type="date"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="billedAmountRupees"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<div className="relative">
												<IconCurrencyRupee className="pointer-events-none absolute top-1/2 left-3 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
												<FloatingLabelInput
													id="billedAmountRupees"
													label="Billed amount"
													type="number"
													min={0}
													step="0.01"
													className="pl-7"
													name={field.name}
													value={field.value}
													onBlur={field.onBlur}
													ref={field.ref}
													onChange={(event) =>
														field.onChange(event.target.valueAsNumber)
													}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="dueDate"
								render={({ field }) => (
									<FormItem className="min-h-19">
										<FormControl>
											<FloatingLabelInput
												{...field}
												id="dueDate"
												label="Due date (optional)"
												type="date"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<DialogFooter className="border-t px-6 py-4">
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={mutation.isPending}>
								Mark invoiced
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
