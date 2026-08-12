import { ModulePageShell } from "@/components/common/ModulePageShell";
import { buildShellPage } from "@/lib/path-utils";

type ProtectedDynamicPageProps = {
	params: Promise<{
		segments: string[];
	}>;
};

export default async function ProtectedDynamicPage({
	params,
}: ProtectedDynamicPageProps) {
	const resolvedParams = await params;
	const page = buildShellPage(
		`/${resolvedParams.segments.join("/")}`,
		"Backend-driven page shell.",
	);

	return <ModulePageShell page={page} />;
}
