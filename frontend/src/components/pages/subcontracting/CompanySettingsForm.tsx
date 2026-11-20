"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSaveCompanySettingsMutation } from "@/lib/api/subcontracting/queries";
import {
	type CompanySettings,
	type CompanySettingsInput,
	type CompanySettingsPayload,
	companySettingsSchema,
} from "@/types/subcontracting";

export function CompanySettingsForm({
	settings,
}: {
	settings: CompanySettings | null;
}) {
	const mutation = useSaveCompanySettingsMutation();
	const form = useForm<CompanySettingsInput, unknown, CompanySettingsPayload>({
		resolver: zodResolver(companySettingsSchema),
		defaultValues: {
			name: settings?.name ?? "",
			address: settings?.address ?? "",
			gstin: settings?.gstin ?? "",
			stateCode: settings?.stateCode ?? "",
		},
	});

	return (
		<Form {...form}>
			<form
				className="max-w-xl space-y-4"
				onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
			>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem className="min-h-19 gap-1.5">
							<Label htmlFor="company-name">Company name</Label>
							<FormControl>
								<Input {...field} id="company-name" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<FormField
					control={form.control}
					name="address"
					render={({ field }) => (
						<FormItem className="min-h-19 gap-1.5">
							<Label htmlFor="company-address">Address</Label>
							<FormControl>
								<Input {...field} id="company-address" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<div className="grid gap-4 sm:grid-cols-2">
					<FormField
						control={form.control}
						name="gstin"
						render={({ field }) => (
							<FormItem className="min-h-19 gap-1.5">
								<Label htmlFor="company-gstin">GSTIN</Label>
								<FormControl>
									<Input {...field} id="company-gstin" maxLength={15} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
					<FormField
						control={form.control}
						name="stateCode"
						render={({ field }) => (
							<FormItem className="min-h-19 gap-1.5">
								<Label htmlFor="company-state-code">State code</Label>
								<FormControl>
									<Input {...field} id="company-state-code" maxLength={2} />
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>
				</div>
				<Button type="submit" disabled={mutation.isPending}>
					{mutation.isPending ? "Saving..." : "Save"}
				</Button>
			</form>
		</Form>
	);
}
