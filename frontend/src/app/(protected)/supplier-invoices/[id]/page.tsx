import { notFound } from "next/navigation";

import { SupplierInvoiceDetailView } from "@/components/views/supplier-invoices/SupplierInvoiceDetailView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function SupplierInvoicePage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <SupplierInvoiceDetailView invoiceId={id} />;
}
