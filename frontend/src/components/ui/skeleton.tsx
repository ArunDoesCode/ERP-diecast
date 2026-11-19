import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn(
				"relative overflow-hidden rounded-md bg-muted after:absolute after:inset-0 after:animate-skeleton after:bg-[linear-gradient(90deg,transparent_0%,color-mix(in_oklab,var(--card)_55%,transparent)_50%,transparent_100%)] after:content-['']",
				className,
			)}
			{...props}
		/>
	);
}

export { Skeleton };
