import { IconLock } from "@tabler/icons-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";

export type NoAccessStateProps = {
	/** Plain name of the screen, e.g. "purchase returns". Omit for a generic message. */
	what?: string;
	/** Permission key the screen needs; named in the message so an administrator knows what to grant. */
	permission?: string;
	/** Address the user tried to open (shown when they landed here from a direct link). */
	path?: string;
};

/** Standard "no access" page body: one h1, a plain reason and a way home (BR-AUTH-30, BR-DS-22). */
export function NoAccessState({ what, permission, path }: NoAccessStateProps) {
	return (
		<div className="flex flex-col gap-4">
			<PageHeader
				title={what ? `You can't view ${what}` : "You can't view this page"}
			/>
			<EmptyState
				icon={IconLock}
				title="Your role does not include this screen"
				description={
					permission
						? `${path ? `${path} needs` : "This screen needs"} the permission ${permission}. Ask an administrator if you need access.`
						: path
							? `${path} is not available to your role. Ask an administrator if you need access.`
							: "Ask an administrator if you need access."
				}
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
