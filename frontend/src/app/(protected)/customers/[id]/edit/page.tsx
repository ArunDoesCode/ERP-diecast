import { notFound } from "next/navigation";

import { CustomerFormView } from "@/components/views/customers/CustomerFormView";

type EditCustomerPageProps = {
	params: Promise<{ id: string }>;
};

export default async function EditCustomerPage({
	params,
}: EditCustomerPageProps) {
	const customerId = Number((await params).id);
	if (!Number.isInteger(customerId) || customerId <= 0) notFound();
	return <CustomerFormView customerId={customerId} />;
}
