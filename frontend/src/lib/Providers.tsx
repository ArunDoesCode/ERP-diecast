"use client";
import { Toaster } from "@/components/ui/sonner";
import React from "react";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ui/theme-provider";

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
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <NuqsAdapter>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors duration={3000} />
        </QueryClientProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
};

export default Providers;
