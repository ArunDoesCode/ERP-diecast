export type HomeTileKey =
	| "approvals"
	| "my_prs_draft"
	| "my_prs_pending"
	| "prs_to_order"
	| "pos_to_send"
	| "my_pos_draft"
	| "pos_late"
	| "goods_expected"
	| "grns_to_inspect"
	| "jobwork_due"
	| "stock_low";

export type HomeTileHint = {
	kind:
		| "oldest_since"
		| "sent_back"
		| "earliest_required"
		| "earliest_due"
		| "oldest_due"
		| "oldest_received"
		| "items";
	date?: string;
	n?: number;
};

export type HomeTile = {
	key: HomeTileKey;
	count?: number;
	tone?: "waiting" | "moving" | "neutral" | "danger";
	late?: number;
	today?: number;
	later?: number;
	hint?: HomeTileHint;
	error?: true;
};

export type HomeCountsResponse = {
	success: true;
	data: { today: string; tiles: HomeTile[] };
};
