import { notFound } from "next/navigation";

import { PurchaseReturnPrintView } from "@/components/views/purchase-returns/PurchaseReturnPrintView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function PurchaseReturnChallanPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <PurchaseReturnPrintView returnId={id} kind="challan" />;
}
