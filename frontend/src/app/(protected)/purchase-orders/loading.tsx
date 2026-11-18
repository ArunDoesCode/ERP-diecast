import { Skeleton } from "@/components/ui/skeleton";

const ROW_KEYS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;

export default function PurchaseOrdersLoading() {
	return (
		<div className="flex w-full flex-col gap-4 p-6">
			<Skeleton className="h-10 w-64" />
			<Skeleton className="h-10 w-full" />
			{ROW_KEYS.map((k) => (
				<Skeleton key={k} className="h-12 w-full" />
			))}
		</div>
	);
}
