import type { Metadata } from "next";

import "./globals.css";
import { Geist_Mono, Manrope } from "next/font/google";
import {
	SIDEBAR_FOLD_INIT_SCRIPT,
	SIDEBAR_FOLD_INIT_STYLE,
} from "@/components/shell/sidebar-fold-init";
import Providers from "@/lib/Providers";
import { DENSITY_INIT_SCRIPT } from "@/lib/shell/density";
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
			<head>
				{/* Saved density and sidebar fold, applied before first paint (#107). */}
				<script>{`${DENSITY_INIT_SCRIPT};${SIDEBAR_FOLD_INIT_SCRIPT}`}</script>
				<style>{SIDEBAR_FOLD_INIT_STYLE}</style>
			</head>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
