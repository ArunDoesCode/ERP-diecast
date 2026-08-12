import { ApprovalCardsSkeleton } from "@/components/pages/approval/ApprovalCards";

export default function ApprovalsLoading() {
	return (
		<div className="flex w-full flex-col gap-6 p-6">
			<ApprovalCardsSkeleton />
		</div>
	);
}
