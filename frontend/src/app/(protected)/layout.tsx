import { NavSidebar } from "@/components/common/Sidebar";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@/components/ui/sidebar";

export default function ProtectedLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<SidebarProvider>
			<NavSidebar />
			<SidebarInset>
				<header className="sticky top-0 z-20 flex h-14 items-center border-b bg-background/90 px-3 backdrop-blur">
					<SidebarTrigger size="lg" />
				</header>
				<div className="flex flex-1 flex-col">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
