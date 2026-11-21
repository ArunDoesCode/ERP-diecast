import Link from "next/link";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { EWAY_OTHER_STATE_LIMIT_PAISE } from "@/lib/delivery-note-math";
import { formatMoney } from "@/lib/format";

export type EwayHintProps = {
	/** Live value in paise (needs `so.view`); undefined = value not visible to this user. */
	valuePaise?: number;
	limitPaise: number;
	/** null while the plant state is unknown. */
	sameState: boolean | null;
	/** Server answer from the last save; null before the first save. */
	serverNeeded: boolean | null;
	canSetCompany: boolean;
};

/** The e-way hint at the top of the transport panel (BR-DSP-23). The server stays the judge. */
export function DnEwayHint({
	valuePaise,
	limitPaise,
	sameState,
	serverNeeded,
	canSetCompany,
}: EwayHintProps) {
	if (sameState === null) {
		return (
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-muted-foreground">
					Company details are not set, so the e-way check cannot run. Posting is
					refused until they are set.
				</span>
				{canSetCompany ? (
					<Link
						href="/subcontracting/settings"
						className="font-medium text-brand-accent hover:underline"
					>
						Set company details
					</Link>
				) : null}
			</div>
		);
	}

	if (valuePaise !== undefined) {
		const limit = sameState ? limitPaise : EWAY_OTHER_STATE_LIMIT_PAISE;
		const needed = valuePaise >= limit;
		const where = sameState ? "same state" : "other state";
		return (
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<StatusBadge
					doc="dnTag"
					status={needed ? "eway_needed" : "eway_optional"}
				/>
				<span>
					{needed
						? `Note value ${formatMoney(valuePaise)} is at or above the ${formatMoney(limit)} limit (${where})`
						: `Note value ${formatMoney(valuePaise)} is below the ${formatMoney(limit)} limit (${where})`}
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-2 text-sm">
			{serverNeeded === null ? null : (
				<StatusBadge
					doc="dnTag"
					status={serverNeeded ? "eway_needed" : "eway_optional"}
				/>
			)}
			<span className="text-muted-foreground">
				{serverNeeded === null
					? "Save the draft to check"
					: "Checked when you save"}
			</span>
		</div>
	);
}
