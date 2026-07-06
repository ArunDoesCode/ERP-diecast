import { notFound } from "next/navigation";

import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

type ProtectedDynamicPageProps = {
	params: Promise<{
		segments: string[];
	}>;
};

export default async function ProtectedDynamicPage({
	params,
}: ProtectedDynamicPageProps) {
	const resolvedParams = await params;
	const path = `/${resolvedParams.segments.join("/")}`;
	const page = getPageDefinition(path);

	if (!page || page.shellless) {
		notFound();
	}

	return <ModulePageShell page={page} />;
}
