import { AppShell } from "@/components/shell/AppShell";

export default function ProtectedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <AppShell>{children}</AppShell>;
}
