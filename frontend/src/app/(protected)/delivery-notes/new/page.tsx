import { DeliveryNoteFormView } from "@/components/views/delivery-notes/DeliveryNoteFormView";

type Props = {
	searchParams: Promise<{ so?: string; line?: string }>;
};

const asId = (value: string | undefined) => {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : undefined;
};

export default async function NewDeliveryNotePage({ searchParams }: Props) {
	const params = await searchParams;
	return (
		<DeliveryNoteFormView soId={asId(params.so)} lineId={asId(params.line)} />
	);
}
