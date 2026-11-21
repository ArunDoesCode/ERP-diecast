import { notFound } from "next/navigation";

import { RfqPrintView } from "@/components/views/rfq/RfqPrintView";

type Props = {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ supplier?: string }>;
};

export default async function RfqPrintPage({ params, searchParams }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	const supplier = Number((await searchParams).supplier);
	return (
		<RfqPrintView
			rfqId={id}
			supplierId={
				Number.isInteger(supplier) && supplier > 0 ? supplier : undefined
			}
		/>
	);
}
