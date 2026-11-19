import { IconInbox } from "@tabler/icons-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";

type RetryableQuery = {
	isError: boolean;
	error: unknown;
	refetch: () => unknown;
	isRefetching: boolean;
};

/** `errorState` prop for a DataTable fed by a query; undefined while the query is fine. */
export function listErrorState(query: RetryableQuery, fallback: string) {
	if (!query.isError) return undefined;
	return (
		<ErrorState
			message={query.error instanceof Error ? query.error.message : fallback}
			onRetry={() => {
				void query.refetch();
			}}
			retrying={query.isRefetching}
		/>
	);
}

/** `emptyState` prop: what is missing, in plain words. */
export function listEmptyState(title: string) {
	return <EmptyState icon={IconInbox} title={title} />;
}
