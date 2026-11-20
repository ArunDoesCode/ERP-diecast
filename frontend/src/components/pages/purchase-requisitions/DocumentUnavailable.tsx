"use client";

import Link from "next/link";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { ApiClientError } from "@/lib/api/client";

/** BR-FF-04: no access, not found, or a failed load, in the words the spec gives. */
export function DocumentUnavailable({
	errors,
	listHref,
	listLabel,
	onRetry,
	retrying,
}: {
	errors: unknown[];
	listHref: string;
	listLabel: string;
	onRetry: () => void;
	retrying?: boolean;
}) {
	const statuses = errors
		.filter((e): e is ApiClientError => e instanceof ApiClientError)
		.map((e) => e.status);
	const back = (
		<Link
			href={listHref}
			className="text-[13px] font-medium text-brand-accent hover:underline"
		>
			Back to {listLabel}
		</Link>
	);
	if (statuses.includes(403)) {
		return (
			<EmptyState
				title="You do not have access to this document"
				action={back}
			/>
		);
	}
	if (statuses.includes(404)) {
		return <EmptyState title="This document does not exist" action={back} />;
	}
	return (
		<ErrorState
			message="Could not load this document."
			onRetry={onRetry}
			retrying={retrying}
		/>
	);
}
