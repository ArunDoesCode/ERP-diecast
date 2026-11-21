import { notFound } from "next/navigation";

import { RfqCompareView } from "@/components/views/rfq/RfqCompareView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function RfqComparePage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <RfqCompareView rfqId={id} />;
}
