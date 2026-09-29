import { notFound } from "next/navigation";

import { ChallanDetailView } from "@/components/views/subcontracting/ChallanDetailView";

type ChallanDetailPageProps = {
	params: Promise<{ challanId: string }>;
};

export default async function ChallanDetailPage({
	params,
}: ChallanDetailPageProps) {
	const challanId = Number((await params).challanId);
	if (Number.isNaN(challanId) || challanId <= 0) notFound();

	return <ChallanDetailView challanId={challanId} />;
}
