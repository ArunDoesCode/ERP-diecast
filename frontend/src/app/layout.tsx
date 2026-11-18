import type { Metadata } from "next";

import "./globals.css";
import { Geist_Mono, Manrope } from "next/font/google";
import Providers from "@/lib/Providers";
import { cn } from "@/lib/utils";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({
	subsets: ["latin"],
	variable: "--font-geist-mono",
	preload: false,
});

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
			className={cn("font-sans", manrope.variable, geistMono.variable)}
			suppressHydrationWarning
		>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
