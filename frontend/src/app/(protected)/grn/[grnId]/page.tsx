import { notFound } from "next/navigation";

import { GrnDetailView } from "@/components/views/grn/GrnDetailView";

type GrnDetailPageProps = {
	params: Promise<{ grnId: string }>;
};

export default async function GrnDetailPage({ params }: GrnDetailPageProps) {
	const resolved = await params;
	const grnId = Number(resolved.grnId);

	if (Number.isNaN(grnId) || grnId <= 0) {
		notFound();
	}

	return <GrnDetailView grnId={grnId} />;
}
