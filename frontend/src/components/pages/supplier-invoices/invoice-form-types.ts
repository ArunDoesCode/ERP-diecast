import type { SinvChargeType } from "@/types/supplier-invoice";

/** One GRN line that can go on the bill, as the entry form knows it. */
export type CatalogLine = {
	grnItemId: number;
	grnNumber: string;
	itemName: string;
	uom: string;
	billableQty: number;
	poRatePaise: number;
	poGstPercent: number;
};

/** An item row in the entry grid: texts exactly as typed. */
export type ItemRow = {
	grnItemId: number;
	qty: string;
	rate: string;
	gst: string;
};

export type ChargeRow = {
	key: string;
	type: SinvChargeType;
	description: string;
	taxable: string;
	gst: string;
};

export type PrintedText = {
	taxable: string;
	cgst: string;
	sgst: string;
	igst: string;
	total: string;
};
