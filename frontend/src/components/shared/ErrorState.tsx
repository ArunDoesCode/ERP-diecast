export type ErrorStateProps = {
	title?: string;
	message: string;
	onRetry?: () => void;
	retrying?: boolean;
};

// Contract stub (BR-DS-07): no logic yet.
export function ErrorState(_props: ErrorStateProps) {
	return null;
}
