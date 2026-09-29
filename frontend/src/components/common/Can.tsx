"use client";

import type { ReactNode } from "react";

import { useCan } from "@/hooks/use-can";

export function Can({
	perm,
	children,
	fallback = null,
}: {
	perm: string;
	children: ReactNode;
	fallback?: ReactNode;
}) {
	return useCan(perm) ? children : fallback;
}
