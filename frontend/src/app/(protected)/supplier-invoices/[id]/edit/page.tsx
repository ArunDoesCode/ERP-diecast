import { notFound } from "next/navigation";

import { SupplierInvoiceFormView } from "@/components/views/supplier-invoices/SupplierInvoiceFormView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function EditSupplierInvoicePage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <SupplierInvoiceFormView invoiceId={id} />;
}
