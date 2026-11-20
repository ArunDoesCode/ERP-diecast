"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/pagination";

const PREFIX = "page-size:";

/**
 * Page size for one list, remembered per list on this browser (BR-FF-105).
 * First render is the default (SSR-safe); the stored value is applied after mount.
 */
export function usePageSize(listKey: string) {
	const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);

	useEffect(() => {
		try {
			const stored = Number(window.localStorage.getItem(PREFIX + listKey));
			if (PAGE_SIZE_OPTIONS.includes(stored)) setPageSizeState(stored);
		} catch {
			// storage blocked: keep the default
		}
	}, [listKey]);

	const setPageSize = useCallback(
		(next: number) => {
			if (!PAGE_SIZE_OPTIONS.includes(next)) return;
			setPageSizeState(next);
			try {
				window.localStorage.setItem(PREFIX + listKey, String(next));
			} catch {
				// storage blocked: not remembered
			}
		},
		[listKey],
	);

	return [pageSize, setPageSize] as const;
}
