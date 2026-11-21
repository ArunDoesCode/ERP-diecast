import { notFound } from "next/navigation";

import { StockTransferDetailView } from "@/components/views/stock-transfers/StockTransferDetailView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function StockTransferPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <StockTransferDetailView transferId={id} />;
}
