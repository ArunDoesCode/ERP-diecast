import { Badge } from "@/components/ui/badge";
import { CHALLAN_DUE_BADGE, formatDaysLeft } from "@/lib/sco-format";
import type { Challan } from "@/types/subcontracting";

export function ChallanDueBadge({
	challan,
}: {
	challan: Pick<Challan, "dueStatus" | "daysLeft">;
}) {
	const style = CHALLAN_DUE_BADGE[challan.dueStatus];
	const overdue = challan.dueStatus === "overdue";
	return (
		<Badge variant={style.variant} className={style.className}>
			{formatDaysLeft(challan.daysLeft)}
			{overdue ? " - deemed supply, tell accounts" : ""}
		</Badge>
	);
}
