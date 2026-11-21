import { Button } from "@/components/ui/button";

/** Small previous / next pager for the narrow side panels. */
export function BomMiniPager({
	page,
	totalPages,
	onPageChange,
}: {
	page: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}) {
	if (totalPages <= 1) return null;
	return (
		<div className="flex items-center justify-between pt-2 text-[13px] text-muted-foreground">
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={page <= 1}
				onClick={() => onPageChange(page - 1)}
			>
				Previous
			</Button>
			<span className="tabular-nums">
				{page} of {totalPages}
			</span>
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={page >= totalPages}
				onClick={() => onPageChange(page + 1)}
			>
				Next
			</Button>
		</div>
	);
}
