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
import { useLoginMutation } from "@/lib/api/auth/queries";
import { type LoginInput, loginSchema } from "@/types/auth";

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
	const loginMutation = useLoginMutation();

	const form = useForm<LoginInput>({
		resolver: zodResolver(loginSchema),
		defaultValues: { email: "", password: "" },
	});

	function onSubmit(data: LoginInput) {
		loginMutation.mutate(data, { onSuccess });
	}

	return (
		<Form {...form}>
			<form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem className="min-h-19 content-start gap-1.5">
							<Label htmlFor="email">Email</Label>
							<FormControl>
								<Input {...field} id="email" type="email" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="password"
					render={({ field }) => (
						<FormItem className="min-h-19 content-start gap-1.5">
							<Label htmlFor="password">Password</Label>
							<FormControl>
								<Input {...field} id="password" type="password" />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<Button
					className="w-full"
					type="submit"
					disabled={loginMutation.isPending}
					// size={"lg"}
				>
					{loginMutation.isPending ? "Signing in..." : "Sign in"}
				</Button>
			</form>
		</Form>
	);
}
