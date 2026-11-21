// Contract #4: GET /api/document/getpanel/:docType/:docId
export type PanelDocType = "pr" | "po" | "grn";

export type PanelTrailEntry = {
	id?: number;
	level?: number;
	action: string;
	actorName?: string | null;
	actionAt?: string;
	notes?: string | null;
};

export type PanelLinkedDoc = {
	docType: "pr" | "po" | "grn" | "sco";
	id: number;
	number: string;
	status: string;
	qaStatus?: "pending" | "passed" | "failed" | "mixed";
	/** false = show as plain text (BR-FF-03). */
	canOpen: boolean;
};

export type PanelHistoryEvent = {
	at: string;
	byName: string | null;
	event: string;
	note?: string;
};

export type DocumentPanelData = {
	totals?: {
		lineCount?: number;
		estimatedAmountPaise?: number;
		subtotalPaise?: number;
		taxAmountPaise?: number;
		totalAmountPaise?: number;
		receivedPct?: number;
		arrivedQty?: number;
		acceptedQty?: number | null;
		rejectedQty?: number | null;
		uom?: string;
	};
	approvals: {
		status: string | null;
		currentLevel: number | null;
		totalLevels: number | null;
		trail: PanelTrailEntry[];
	} | null;
	linked: PanelLinkedDoc[];
	history: PanelHistoryEvent[];
	historyTruncated: boolean;
};

export type DocumentPanelResult = { success: true; data: DocumentPanelData };
