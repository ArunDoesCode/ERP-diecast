import { notFound } from "next/navigation";

import { ScoDetailView } from "@/components/views/subcontracting/ScoDetailView";

type ScoDetailPageProps = {
	params: Promise<{ scoId: string }>;
};

export default async function ScoDetailPage({ params }: ScoDetailPageProps) {
	const scoId = Number((await params).scoId);
	if (Number.isNaN(scoId) || scoId <= 0) notFound();

	return <ScoDetailView scoId={scoId} />;
}
