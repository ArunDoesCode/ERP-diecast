import { notFound } from "next/navigation";

import { QuoteFormView } from "@/components/views/rfq/QuoteFormView";

type Props = {
	params: Promise<{ id: string; quoteId: string }>;
};

export default async function QuotePage({ params }: Props) {
	const { id, quoteId } = await params;
	const rfqId = Number(id);
	const quote = Number(quoteId);
	if (!Number.isInteger(rfqId) || rfqId <= 0) notFound();
	if (!Number.isInteger(quote) || quote <= 0) notFound();
	return <QuoteFormView rfqId={rfqId} quoteId={quote} />;
}
