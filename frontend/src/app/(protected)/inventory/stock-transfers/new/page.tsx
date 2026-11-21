import { StockTransferFormView } from "@/components/views/stock-transfers/StockTransferFormView";

type Props = {
	searchParams: Promise<{ item?: string; from?: string }>;
};

function positiveInt(value: string | undefined) {
	const n = Number(value);
	return Number.isInteger(n) && n > 0 ? n : undefined;
}

export default async function NewStockTransferPage({ searchParams }: Props) {
	const params = await searchParams;
	return (
		<StockTransferFormView
			itemId={positiveInt(params.item)}
			fromId={positiveInt(params.from)}
		/>
	);
}
