"use client";
import { Toaster } from "@/components/ui/sonner";
import React from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TooltipProvider } from "@/components/ui/tooltip";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1,
		},
	},
});

const Providers = ({ children }: { children: React.ReactNode }) => {
	return (
		<NuqsAdapter>
			<QueryClientProvider client={queryClient}>
				<TooltipProvider>
				{children}
				</TooltipProvider>
				<Toaster />
			</QueryClientProvider>
		</NuqsAdapter>
	);
};

export default Providers;
