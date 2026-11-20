"use client";

import { useEffect } from "react";

export const LEAVE_PROMPT = "Leave without saving?";

/**
 * Full-page form guard (BR-FF-112): reload / tab close, in-app links and browser Back
 * ask "Leave without saving?" while `dirty` is true. Set `dirty` to false before the
 * save navigates away so no question is asked after saving.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
	useEffect(() => {
		if (!dirty) return;

		const onBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = "";
		};

		// In-app links: capture phase, before Next's Link handler navigates.
		const onClick = (e: MouseEvent) => {
			if (e.defaultPrevented || e.button !== 0) return;
			if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
			const anchor = (e.target as Element | null)?.closest?.("a[href]");
			if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
			if (anchor.target && anchor.target !== "_self") return;
			if (anchor.hasAttribute("download")) return;
			const url = new URL(anchor.href, window.location.href);
			if (url.origin !== window.location.origin) return;
			if (
				url.pathname === window.location.pathname &&
				url.search === window.location.search
			)
				return;
			if (!window.confirm(LEAVE_PROMPT)) {
				e.preventDefault();
				e.stopPropagation();
			}
		};

		// Browser Back: keep a sentinel entry; on pop, ask, and re-push when the user stays.
		window.history.pushState({ unsavedGuard: true }, "", window.location.href);
		let leaving = false;
		const onPopState = () => {
			if (leaving) return;
			if (window.confirm(LEAVE_PROMPT)) {
				leaving = true;
				window.history.back();
			} else {
				window.history.pushState(
					{ unsavedGuard: true },
					"",
					window.location.href,
				);
			}
		};

		window.addEventListener("beforeunload", onBeforeUnload);
		document.addEventListener("click", onClick, true);
		window.addEventListener("popstate", onPopState);
		return () => {
			window.removeEventListener("beforeunload", onBeforeUnload);
			document.removeEventListener("click", onClick, true);
			window.removeEventListener("popstate", onPopState);
		};
	}, [dirty]);
}
