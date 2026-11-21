import { notFound } from "next/navigation";

import { StockTransferFormView } from "@/components/views/stock-transfers/StockTransferFormView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function EditStockTransferPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <StockTransferFormView transferId={id} />;
}
