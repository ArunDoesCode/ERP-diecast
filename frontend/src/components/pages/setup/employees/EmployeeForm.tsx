"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { type Resolver, useForm } from "react-hook-form";

import { QrTokenPanel } from "@/components/pages/setup/employees/QrTokenPanel";
import { Button } from "@/components/ui/button";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
	useAssignableRolesQuery,
	useCreateEmployeeMutation,
	useUpdateEmployeeMutation,
} from "@/lib/api/setup/queries";
import { type EmployeeInput, employeeSchema } from "@/types/setup";

type EmployeeFormProps = {
	mode: "create" | "edit";
	defaultValues?: EmployeeInput;
	employeeId?: number;
	qrToken?: string | null;
	onDirtyChange?: (dirty: boolean) => void;
	onDone: () => void;
};

export function EmployeeForm({
	mode,
	defaultValues,
	employeeId,
	qrToken,
	onDirtyChange,
	onDone,
}: EmployeeFormProps) {
	const rolesQuery = useAssignableRolesQuery();
	const createEmployeeMutation = useCreateEmployeeMutation();
	const updateEmployeeMutation = useUpdateEmployeeMutation();

	const roles = rolesQuery.data?.data ?? [];
	const isPending =
		mode === "create"
			? createEmployeeMutation.isPending
			: updateEmployeeMutation.isPending;

	const form = useForm<EmployeeInput>({
		// ponytail: employeeSchema mixes z.coerce + superRefine, so zodResolver's
		// inferred input type diverges from EmployeeInput (z.output) — cast is the
		// documented workaround for zod4 + @hookform/resolvers coerced schemas
		resolver: zodResolver(employeeSchema) as unknown as Resolver<EmployeeInput>,
		defaultValues: defaultValues ?? {
			name: "",
			phone: "",
			dailyRatePaise: 0,
			roleId: 0,
			loginMethod: "password",
			email: "",
			password: "",
		},
	});

	const loginMethod = form.watch("loginMethod");

	useEffect(() => {
		onDirtyChange?.(form.formState.isDirty);
	}, [form.formState.isDirty, onDirtyChange]);

	function onSubmit(values: EmployeeInput) {
		if (
			mode === "create" &&
			values.loginMethod === "password" &&
			!values.password
		) {
			form.setError("password", {
				type: "manual",
				message: "Password is required",
			});
			return;
		}

		if (mode === "create") {
			createEmployeeMutation.mutate(values, { onSuccess: onDone });
			return;
		}

		if (!employeeId) return;
		// Don't overwrite an existing password with a blank one just because the
		// admin didn't retype it while editing unrelated fields.
		const payload = values.password
			? values
			: { ...values, password: undefined };
		updateEmployeeMutation.mutate(
			{ id: employeeId, input: payload },
			{ onSuccess: onDone },
		);
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem className="min-h-19 mt-2">
							<FormControl>
								<FloatingLabelInput {...field} id="name" label="Name" />
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
								<FloatingLabelInput {...field} id="phone" label="Phone" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="dailyRatePaise"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormControl>
								<FloatingLabelInput
									id="dailyRatePaise"
									label="Daily Rate (paise)"
									type="number"
									name={field.name}
									value={field.value}
									onBlur={field.onBlur}
									ref={field.ref}
									onChange={(event) =>
										field.onChange(event.target.valueAsNumber)
									}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="roleId"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Role</FormLabel>
							<Select
								value={field.value ? String(field.value) : ""}
								disabled={mode === "edit"}
								onValueChange={(value) => field.onChange(Number(value))}
							>
								<FormControl>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select role" />
									</SelectTrigger>
								</FormControl>
								<SelectContent>
									{roles.map((role) => (
										<SelectItem key={role.id} value={String(role.id)}>
											{role.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{mode === "edit" && (
								<p className="text-xs text-muted-foreground">
									Use "Change role" in the employee list to change the role.
								</p>
							)}
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="loginMethod"
					render={({ field }) => (
						<FormItem className="min-h-19">
							<FormLabel>Login Method</FormLabel>
							<ToggleGroup
								type="single"
								variant="outline"
								value={field.value}
								onValueChange={(value) => {
									if (value) field.onChange(value);
								}}
							>
								<ToggleGroupItem value="password">Password</ToggleGroupItem>
								<ToggleGroupItem value="qr">QR</ToggleGroupItem>
							</ToggleGroup>
							<FormMessage />
						</FormItem>
					)}
				/>

				{loginMethod === "password" ? (
					<>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem className="min-h-19">
									<FormControl>
										<FloatingLabelInput
											{...field}
											id="email"
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
							name="password"
							render={({ field }) => (
								<FormItem className="min-h-19">
									<FormControl>
										<FloatingLabelInput
											{...field}
											id="password"
											label="Password"
											type="password"
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</>
				) : (
					<QrTokenPanel mode={mode} employeeId={employeeId} qrToken={qrToken} />
				)}

				<Button className="w-full" type="submit" disabled={isPending}>
					{isPending ? "Saving..." : "Save"}
				</Button>
			</form>
		</Form>
	);
}
