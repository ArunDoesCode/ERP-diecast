import { notFound } from "next/navigation";

import { RfqFormView } from "@/components/views/rfq/RfqFormView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function EditRfqPage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <RfqFormView rfqId={id} />;
}
