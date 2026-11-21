import { notFound } from "next/navigation";

import { DeliveryNoteDetailView } from "@/components/views/delivery-notes/DeliveryNoteDetailView";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function DeliveryNotePage({ params }: Props) {
	const id = Number((await params).id);
	if (!Number.isInteger(id) || id <= 0) notFound();
	return <DeliveryNoteDetailView noteId={id} />;
}
