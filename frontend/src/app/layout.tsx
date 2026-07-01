import type { Metadata } from "next";

import "./globals.css";
import { Manrope } from "next/font/google";
import { cn } from "@/lib/utils";
import Providers from "@/lib/Providers";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
	title: "DiecastOS Split Starter",
	description: "Frontend on Next.js talking to Hono backend only.",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en" className={cn("font-sans", manrope.variable)}>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
