import { BomFormView } from "@/components/views/bom/BomFormView";

type NewBomPageProps = {
	searchParams: Promise<{ part?: string; sku?: string; name?: string }>;
};

export default async function NewBomPage({ searchParams }: NewBomPageProps) {
	const { part, sku, name } = await searchParams;
	const partId = Number(part);
	return (
		<BomFormView
			presetPart={
				Number.isInteger(partId) && partId > 0
					? { id: partId, sku, name }
					: undefined
			}
		/>
	);
}
