import type { ReactNode } from "react";

export type DocumentFlowStep = {
	label: string;
	docNo?: string;
	href?: string;
	status?: ReactNode;
	state: "done" | "current" | "todo";
};

export type DocumentFlowProps = {
	steps: DocumentFlowStep[];
	loading?: boolean;
	error?: boolean;
	onRetry?: () => void;
};

// Contract stub (BR-DS-12): no logic yet.
export function DocumentFlow(_props: DocumentFlowProps) {
	return null;
}
