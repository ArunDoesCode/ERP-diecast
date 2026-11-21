import type { GrnListQuery } from "./list-types";
import type { ReceivableParams } from "./receivable-types";

export const grnKeys = {
	list: (params?: GrnListQuery) =>
		params ? (["grn", "list", params] as const) : (["grn", "list"] as const),
	detail: (grnId: number) => ["grn", "detail", grnId] as const,
	receivable: (params?: ReceivableParams) =>
		params
			? (["grn", "receivable", params] as const)
			: (["grn", "receivable"] as const),
};
