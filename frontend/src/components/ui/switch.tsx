"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Switch({
	className,
	size = "default",
	...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
	size?: "sm" | "default";
}) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			data-size={size}
			className={cn(
				"peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-colors duration-(--motion-fast) ease-standard outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 h-8 before:absolute before:inset-x-0 before:top-1/2 before:-translate-y-1/2 before:rounded-full before:transition-colors data-[size=default]:w-[28px] data-[size=default]:before:h-[16.6px] data-[size=sm]:w-[24px] data-[size=sm]:before:h-[14px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 data-checked:before:bg-primary data-unchecked:before:bg-input dark:data-unchecked:before:bg-input/80 data-disabled:cursor-not-allowed data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="pointer-events-none relative block rounded-full bg-background ring-0 transition-transform group-data-[size=default]/switch:size-3.5 group-data-[size=sm]/switch:size-3 group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] dark:data-checked:bg-primary-foreground group-data-[size=default]/switch:data-unchecked:translate-x-0 group-data-[size=sm]/switch:data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
