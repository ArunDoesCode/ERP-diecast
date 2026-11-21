import { IconAlertTriangle } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

export type ErrorStateProps = {
	title?: string;
	message: string;
	onRetry?: () => void;
	retrying?: boolean;
};

export function ErrorState({
	title = "Something went wrong",
	message,
	onRetry,
	retrying,
}: ErrorStateProps) {
	return (
		<div
			role="alert"
			className="flex flex-col items-center gap-2 px-4 py-10 text-center"
		>
			<span className="text-destructive">
				<IconAlertTriangle size={24} aria-hidden="true" />
			</span>
			<p className="text-sm font-medium">{title}</p>
			<p className="max-w-sm text-sm text-muted-foreground">{message}</p>
			{onRetry ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="mt-2"
					disabled={retrying}
					onClick={onRetry}
				>
					{retrying ? "Trying…" : "Try again"}
				</Button>
			) : null}
		</div>
	);
}
