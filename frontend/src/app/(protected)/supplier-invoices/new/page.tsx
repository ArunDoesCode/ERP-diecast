import { SupplierInvoiceFormView } from "@/components/views/supplier-invoices/SupplierInvoiceFormView";

type NewSupplierInvoicePageProps = {
	searchParams: Promise<{ poId?: string; grnId?: string }>;
};

function positiveInt(value: string | undefined) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function NewSupplierInvoicePage({
	searchParams,
}: NewSupplierInvoicePageProps) {
	const params = await searchParams;
	return (
		<SupplierInvoiceFormView
			poId={positiveInt(params.poId)}
			grnId={positiveInt(params.grnId)}
		/>
	);
}
