import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDaysLeft } from "@/lib/sco-format";
import type { Challan } from "@/types/subcontracting";

export function ChallanDueBadge({
	challan,
}: {
	challan: Pick<Challan, "dueStatus" | "daysLeft">;
}) {
	const overdue = challan.dueStatus === "overdue";
	return (
		<span className="inline-flex flex-wrap items-center gap-2">
			<StatusBadge doc="challanDue" status={challan.dueStatus} />
			<span className="text-sm text-muted-foreground">
				{formatDaysLeft(challan.daysLeft)}
			</span>
			{overdue ? (
				<span className="text-sm text-destructive">
					Deemed supply, tell accounts
				</span>
			) : null}
		</span>
	);
}
