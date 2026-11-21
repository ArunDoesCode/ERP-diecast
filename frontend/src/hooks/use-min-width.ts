import { useSyncExternalStore } from "react";

/** True when the viewport is at least `px` wide. False on the server and before hydration. */
export function useMinWidth(px: number) {
	return useSyncExternalStore(
		(onChange) => {
			const mql = window.matchMedia(`(min-width: ${px}px)`);
			mql.addEventListener("change", onChange);
			return () => mql.removeEventListener("change", onChange);
		},
		() => window.matchMedia(`(min-width: ${px}px)`).matches,
		() => false,
	);
}
