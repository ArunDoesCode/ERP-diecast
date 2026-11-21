import type { SoRaisedDocument } from "@/types/sale-order";

/** Rupees text -> integer paise; NaN when it is not a number. */
export function rupeesToPaise(text: string) {
	const t = text.trim();
	if (t === "") return Number.NaN;
	const n = Number(t);
	return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
}

export function paiseToRupees(paise: number) {
	return (paise / 100).toFixed(2);
}

/** Document numbers (PR-… / SCO-…) found anywhere in an error's `details`. */
export function detailDocNumbers(details: unknown): string[] {
	const found = new Set<string>();
	const walk = (value: unknown, depth: number) => {
		if (depth > 4 || value === null || value === undefined) return;
		if (typeof value === "string") {
			if (/^(PR|SCO)-/i.test(value)) found.add(value);
			return;
		}
		if (Array.isArray(value)) {
			for (const entry of value) walk(entry, depth + 1);
			return;
		}
		if (typeof value === "object") {
			for (const entry of Object.values(value)) walk(entry, depth + 1);
		}
	};
	walk(details, 0);
	return [...found];
}

export function errorDetails(error: unknown): unknown {
	if (typeof error !== "object" || error === null) return undefined;
	const body = (error as { body?: unknown }).body;
	return typeof body === "object" && body !== null
		? (body as { details?: unknown }).details
		: undefined;
}

export function raisedDocHref(doc: Pick<SoRaisedDocument, "type" | "id">) {
	return doc.type === "sco"
		? `/subcontracting/${doc.id}`
		: "/purchase-requisitions";
}
