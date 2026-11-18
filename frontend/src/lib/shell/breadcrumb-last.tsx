"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

type Setter = (label: string | undefined) => void;

const SetLastCrumbContext = createContext<Setter | null>(null);
const LastCrumbContext = createContext<string | undefined>(undefined);

/** Holds the label a detail page sets for the last breadcrumb (e.g. the document number). */
export function BreadcrumbLastProvider({ children }: { children: ReactNode }) {
	const [label, setLabel] = useState<string | undefined>(undefined);
	return (
		<SetLastCrumbContext.Provider value={setLabel}>
			<LastCrumbContext.Provider value={label}>
				{children}
			</LastCrumbContext.Provider>
		</SetLastCrumbContext.Provider>
	);
}

/** Read by AppShell and passed to buildBreadcrumbs as `docNumber`. */
export function useBreadcrumbLastLabel(): string | undefined {
	return useContext(LastCrumbContext);
}

/** A page calls this to set the last crumb; cleared when the page unmounts or the label is undefined. */
export function useBreadcrumbLast(label: string | undefined): void {
	const set = useContext(SetLastCrumbContext);
	useEffect(() => {
		if (!set || !label) return;
		set(label);
		return () => set(undefined);
	}, [set, label]);
}
