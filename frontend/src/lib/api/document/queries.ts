"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ApiClientError } from "@/lib/api/client";
import { getDocumentPanel } from "./fetchers";
import type { PanelDocType } from "./types";

export const documentKeys = {
	all: ["document"] as const,
	panel: (docType: PanelDocType, docId: number) =>
		["document", "panel", docType, docId] as const,
};

export function useDocumentPanelQuery(docType: PanelDocType, docId: number) {
	return useQuery({
		queryKey: documentKeys.panel(docType, docId),
		queryFn: () => getDocumentPanel(docType, docId),
		enabled: Number.isInteger(docId) && docId > 0,
		// 4xx and 501 are final answers for this visit.
		retry: (count, error) =>
			!(error instanceof ApiClientError && error.status < 600) && count < 2,
	});
}

/** Call after an action on the document so the side panel shows the new state. */
export function useRefreshDocumentPanel() {
	const queryClient = useQueryClient();
	return () => queryClient.invalidateQueries({ queryKey: documentKeys.all });
}
