import { notFound } from "next/navigation";

import { DeliveryNotePrintView } from "@/components/views/delivery-notes/DeliveryNotePrintView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function PrintDeliveryNotePage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <DeliveryNotePrintView noteId={id} />;
}
