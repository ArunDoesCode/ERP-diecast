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
				<SidebarTrigger size="lg" className="flex justify-start w-fit" />
				<div className="">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
