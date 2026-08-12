"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
});

const Providers = ({ children }: { children: ReactNode }) => {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			disableTransitionOnChange
		>
			<NuqsAdapter>
				<QueryClientProvider client={queryClient}>
					<TooltipProvider>{children}</TooltipProvider>
					<Toaster duration={5000} />
				</QueryClientProvider>
			</NuqsAdapter>
		</ThemeProvider>
	);
};

export default Providers;
