"use client";

import {
	IconAlertOctagon,
	IconAlertTriangle,
	IconCircleCheck,
	IconInfoCircle,
	IconLoader,
} from "@tabler/icons-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps, toast } from "sonner";

// BR-DS-23: success closes after 4 s (Toaster default); an error stays until closed.
const originalError = toast.error;
let errorPatched = false;
if (!errorPatched) {
	errorPatched = true;
	toast.error = ((message, data) =>
		originalError(message, {
			duration: Number.POSITIVE_INFINITY,
			closeButton: true,
			...data,
		})) as typeof toast.error;
}

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			// pointer-events-auto: a modal dialog sets pointer-events:none on <body>; toasts must stay clickable.
			className="toaster group pointer-events-auto"
			icons={{
				success: <IconCircleCheck className="size-4" />,
				info: <IconInfoCircle className="size-4" />,
				warning: <IconAlertTriangle className="size-4" />,
				error: <IconAlertOctagon className="size-4" />,
				loading: <IconLoader className="size-4" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
