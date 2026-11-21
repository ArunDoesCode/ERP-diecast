import type {
	DnDetail,
	DnMode,
	DnTransport,
	DnTransportHistoryField,
	DnTransportInput,
} from "@/types/delivery-note";
import { DN_QTY_MAX, dnQtyDecimals } from "@/types/delivery-note";

export const MODE_LABEL: Record<DnMode, string> = {
	road: "Road",
	rail: "Rail",
	air: "Air",
	ship: "Ship",
};

export const TRANSPORT_FIELD_LABEL: Record<DnTransportHistoryField, string> = {
	vehicleNo: "Vehicle no.",
	transporterId: "Transporter ID",
	transporterName: "Transport name",
	transportDocNo: "Transport doc no.",
	transportDocDate: "Transport doc date",
	ewayBillNo: "E-way bill no.",
	ewayBillDate: "E-way bill date",
	distanceKm: "Distance (km)",
};

export const ACTIVITY_LABEL: Record<string, string> = {
	"dispatch.create": "Created",
	"dispatch.edit": "Edited",
	"dispatch.post": "Posted",
	"dispatch.transport": "Transport updated",
	"dispatch.cancel": "Cancelled",
	"dispatch.cancel_draft": "Draft cancelled",
};

export function activityLabel(action: string) {
	return ACTIVITY_LABEL[action] ?? action.replace(/^dispatch\./, "");
}

/** `123456789012` shown as `1234 5678 9012`. */
export function groupEway(value: string | null | undefined) {
	if (!value) return "–";
	return value.replace(/\s+/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

export const normaliseVehicle = (value: string) =>
	value.replace(/[\s-]+/g, "").toUpperCase();
export const normaliseTransporterId = (value: string) =>
	value.replace(/\s+/g, "").toUpperCase();
export const normaliseEway = (value: string) => value.replace(/\s+/g, "");

const VEHICLE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/;
const TRANSPORTER = /^\d{2}[A-Z0-9]{13}$/;

export function vehicleError(value: string): string | null {
	const v = normaliseVehicle(value);
	if (v === "") return null;
	return v.length <= 15 && VEHICLE.test(v)
		? null
		: "Use the format MH12AB1234 (or 22BH1234AA)";
}

export function transporterIdError(value: string): string | null {
	const v = normaliseTransporterId(value);
	if (v === "") return null;
	return TRANSPORTER.test(v) ? null : "15 characters, like a GSTIN";
}

export function ewayNoError(value: string): string | null {
	const v = normaliseEway(value);
	if (v === "") return null;
	return /^\d{12}$/.test(v) ? null : "12 digits";
}

export function distanceError(value: string): string | null {
	const t = value.trim();
	if (t === "") return null;
	const n = Number(t);
	return Number.isInteger(n) && n >= 1 && n <= 4000
		? null
		: "Whole km, 1 to 4,000";
}

/** Why a typed quantity is wrong, or null when it is fine. `cap` is the open qty. */
export function lineQtyError(
	text: string,
	uom: string,
	cap: number,
): string | null {
	const t = text.trim();
	if (t === "") return "Enter a quantity";
	const n = Number(t);
	if (!Number.isFinite(n) || n <= 0) return "Quantity must be more than 0";
	if (dnQtyDecimals(uom) === 0 && !Number.isInteger(n)) {
		return `${uom} must be a whole number`;
	}
	if ((t.split(".")[1]?.length ?? 0) > 3) return "Up to 3 decimals";
	if (n > DN_QTY_MAX) return "Too large";
	if (n > cap + 1e-9) return `Only ${cap} open`;
	return null;
}

/** Positive decimal with at most 3 places, as the weights and package qty need. */
export function positiveDecimalError(text: string): string | null {
	const t = text.trim();
	if (t === "") return "Required";
	const n = Number(t);
	if (!Number.isFinite(n) || n <= 0) return "More than 0";
	if ((t.split(".")[1]?.length ?? 0) > 3) return "Up to 3 decimals";
	if (n > 50000) return "At most 50,000";
	return null;
}

// ---- Transport form state ----

export type TransportDraft = {
	mode: DnMode;
	vehicleNo: string;
	transporterId: string;
	transporterName: string;
	transportDocNo: string;
	transportDocDate: string;
	distanceKm: string;
	ewayBillNo: string;
	ewayBillDate: string;
};

export function emptyTransport(): TransportDraft {
	return {
		mode: "road",
		vehicleNo: "",
		transporterId: "",
		transporterName: "",
		transportDocNo: "",
		transportDocDate: "",
		distanceKm: "",
		ewayBillNo: "",
		ewayBillDate: "",
	};
}

export function transportFromDetail(t: DnTransport): TransportDraft {
	return {
		mode: t.mode ?? "road",
		vehicleNo: t.vehicleNo ?? "",
		transporterId: t.transporterId ?? "",
		transporterName: t.transporterName ?? "",
		transportDocNo: t.transportDocNo ?? "",
		transportDocDate: t.transportDocDate ?? "",
		distanceKm: t.distanceKm === null ? "" : String(t.distanceKm),
		ewayBillNo: t.ewayBillNo ?? "",
		ewayBillDate: t.ewayBillDate ?? "",
	};
}

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

/** Every key goes out, an empty one as `null`, so a cleared field really clears (PATCH merges key by key). */
export function transportPayload(draft: TransportDraft): DnTransportInput {
	const road = draft.mode === "road";
	return {
		mode: draft.mode,
		vehicleNo: road ? orNull(normaliseVehicle(draft.vehicleNo)) : null,
		transporterId: road
			? orNull(normaliseTransporterId(draft.transporterId))
			: null,
		transporterName: orNull(draft.transporterName),
		transportDocNo: road ? null : orNull(draft.transportDocNo),
		transportDocDate: road ? null : orNull(draft.transportDocDate),
		distanceKm:
			draft.distanceKm.trim() === "" ? null : Number(draft.distanceKm),
		ewayBillNo: orNull(normaliseEway(draft.ewayBillNo)),
		ewayBillDate: orNull(draft.ewayBillDate),
	};
}

/** Customer state vs plant state. null while the plant state is unknown. */
export function isSameState(
	plantStateCode: string | null | undefined,
	shipToStateCode: string | null | undefined,
): boolean | null {
	if (!plantStateCode || !shipToStateCode) return null;
	return plantStateCode === shipToStateCode;
}

export function creatorName(detail: DnDetail) {
	return detail.createdBy?.name ?? "–";
}
