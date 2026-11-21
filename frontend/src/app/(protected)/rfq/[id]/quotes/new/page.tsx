import { notFound } from "next/navigation";

import { QuoteFormView } from "@/components/views/rfq/QuoteFormView";

type Props = {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ supplier?: string }>;
};

export default async function NewQuotePage({ params, searchParams }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	const supplier = Number((await searchParams).supplier);
	return (
		<QuoteFormView
			rfqId={id}
			supplierId={
				Number.isInteger(supplier) && supplier > 0 ? supplier : undefined
			}
		/>
	);
}
