import type { ReorderRun } from "@/types/reorder";

/** Quantities: up to 3 decimals, no padding (item units differ). */
export function qtyText(value: number | null | undefined) {
	if (value === null || value === undefined) return "–";
	return value.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** Same wording everywhere: no starter = the daily schedule. */
export function startedByText(run: Pick<ReorderRun, "trigger" | "startedBy">) {
	if (run.trigger === "schedule" || !run.startedBy) return "Daily schedule";
	return run.startedBy.name;
}

export function runNo(id: number) {
	return `Run ${id}`;
}

export function hourLabel(hour: number) {
	return `${String(hour).padStart(2, "0")}:00`;
}
