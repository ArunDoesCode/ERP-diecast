"use client";

import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApprovalPreviewPane } from "@/components/pages/approval/ApprovalPreviewPane";
import { ErrorState } from "@/components/shared/ErrorState";
import type { ApprovalDocType } from "@/types/approval";

const DOC_TYPES: ApprovalDocType[] = ["pr", "po", "sco"];

/** Narrow screens (< 1100 px): the preview as its own page, Back returns to the list. */
export function ApprovalPreviewPageView({
	docType,
	docId,
}: {
	docType: string;
	docId: string;
}) {
	const router = useRouter();
	const id = Number(docId);
	const valid =
		DOC_TYPES.includes(docType as ApprovalDocType) &&
		Number.isInteger(id) &&
		id > 0;

	return (
		<div className="flex w-full flex-col gap-4">
			<Link
				href="/approvals"
				className="inline-flex w-fit items-center gap-1 text-sm text-brand-accent hover:underline"
			>
				<IconArrowLeft size={16} aria-hidden="true" />
				Back to approvals
			</Link>
			{valid ? (
				<ApprovalPreviewPane
					docType={docType as ApprovalDocType}
					docId={id}
					onActed={() => router.push("/approvals")}
				/>
			) : (
				<ErrorState message="This document link is not valid." />
			)}
		</div>
	);
}
