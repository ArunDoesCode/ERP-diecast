import { Skeleton } from "@/components/ui/skeleton";

export default function NewGrnLoading() {
	return (
		<div className="flex w-full flex-col gap-4">
			<Skeleton className="h-10 w-64" />
			<Skeleton className="h-10 w-full" />
			<Skeleton className="h-48 w-full" />
		</div>
	);
}
