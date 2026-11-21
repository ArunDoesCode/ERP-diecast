import { notFound } from "next/navigation";

import { DeliveryNoteFormView } from "@/components/views/delivery-notes/DeliveryNoteFormView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function EditDeliveryNotePage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <DeliveryNoteFormView noteId={id} />;
}
