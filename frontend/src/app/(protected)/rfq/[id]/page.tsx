import { notFound } from "next/navigation";

import { RfqDetailView } from "@/components/views/rfq/RfqDetailView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function RfqDetailPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <RfqDetailView rfqId={id} />;
}
