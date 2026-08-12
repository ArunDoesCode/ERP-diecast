import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface InputProps
	extends React.InputHTMLAttributes<HTMLInputElement> {}

const FloatingInput = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, ...props }, ref) => {
		return (
			<Input
				placeholder=" "
				className={cn(
					"peer h-12 rounded-lg px-3 pt-5 pb-2 text-base md:text-sm",
					className,
				)}
				ref={ref}
				{...props}
			/>
		);
	},
);
FloatingInput.displayName = "FloatingInput";

const FloatingLabel = React.forwardRef<
	React.ElementRef<typeof Label>,
	React.ComponentPropsWithoutRef<typeof Label>
>(({ className, ...props }, ref) => {
	return (
		<Label
			className={cn(
				"absolute left-3 top-0 z-10 origin-left -translate-y-1/2 scale-90 backdrop-blur-xs px-1 text-base text-muted-foreground transition-all duration-200 dark:text-white peer-placeholder-shown:top-1/4 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-placeholder-shown:px-0 peer-placeholder-shown:text-sm peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:scale-90 peer-focus:px-1 peer-focus:text-primary dark:peer-focus:text-white rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4 cursor-text",
				className,
			)}
			ref={ref}
			{...props}
		/>
	);
});
FloatingLabel.displayName = "FloatingLabel";

type FloatingLabelInputProps = InputProps & { label?: string };

const FloatingLabelInput = React.forwardRef<
	React.ElementRef<typeof FloatingInput>,
	React.PropsWithoutRef<FloatingLabelInputProps>
>(({ id, label, ...props }, ref) => {
	return (
		<div className="relative">
			<FloatingInput ref={ref} id={id} {...props} />
			<FloatingLabel htmlFor={id}>{label}</FloatingLabel>
		</div>
	);
});
FloatingLabelInput.displayName = "FloatingLabelInput";

export { FloatingInput, FloatingLabel, FloatingLabelInput };
