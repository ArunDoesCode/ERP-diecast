import type { Metadata } from "next";

import "./globals.css";
import { Manrope } from "next/font/google";
import Providers from "@/lib/Providers";
import { cn } from "@/lib/utils";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "DieCast ERP",
	description: "DieCast ERP",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			className={cn("font-sans", manrope.variable)}
			suppressHydrationWarning
		>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
