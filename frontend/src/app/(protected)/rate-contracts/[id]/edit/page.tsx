import { notFound } from "next/navigation";

import { RateContractFormView } from "@/components/views/rate-contracts/RateContractFormView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function EditRateContractPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <RateContractFormView contractId={id} />;
}
