import { api } from "@/lib/api/client";
import { API_ROUTES } from "@/lib/api/routes";
import type { DocumentPanelResult, PanelDocType } from "./types";

export function getDocumentPanel(docType: PanelDocType, docId: number) {
	return api.get<DocumentPanelResult>(
		API_ROUTES.document.panel(docType, docId),
	);
}
