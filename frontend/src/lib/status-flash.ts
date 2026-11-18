/** True when `next` differs from `prev` and prev was already set (no flash on first load). BR-DS-12. */
export function shouldFlashStatus(
	prev: string | null | undefined,
	next: string | null | undefined,
): boolean {
	if (prev === null || prev === undefined || prev === "") return false;
	if (next === null || next === undefined) return false;
	return prev !== next;
}
