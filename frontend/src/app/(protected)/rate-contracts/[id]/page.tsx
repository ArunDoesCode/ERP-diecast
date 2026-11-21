import { notFound } from "next/navigation";

import { RateContractDetailView } from "@/components/views/rate-contracts/RateContractDetailView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function RateContractPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <RateContractDetailView contractId={id} />;
}
