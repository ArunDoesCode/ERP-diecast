import { Skeleton } from "@/components/ui/skeleton";

export default function DeliveryNotesLoading() {
	return (
		<div className="p-6">
			<Skeleton className="h-32 w-full" />
		</div>
	);
}
