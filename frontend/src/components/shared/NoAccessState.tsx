import { IconLock } from "@tabler/icons-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";

export type NoAccessStateProps = {
	/** Plain name of the screen, e.g. "purchase returns". Omit for a generic message. */
	what?: string;
};

/** Standard "no access" page body: one h1, a plain reason and a way home (BR-AUTH-30, BR-DS-22). */
export function NoAccessState({ what }: NoAccessStateProps) {
	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={what ? `You can't view ${what}` : "You can't view this page"}
			/>
			<EmptyState
				icon={IconLock}
				title="Your role does not include this screen"
				description="Ask an administrator if you need access."
				action={
					<Link
						href="/landing"
						className="text-sm font-medium text-brand-accent hover:underline"
					>
						Go to home
					</Link>
				}
			/>
		</div>
	);
}
