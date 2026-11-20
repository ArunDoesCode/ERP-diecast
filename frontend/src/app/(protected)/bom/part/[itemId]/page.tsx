import { notFound } from "next/navigation";

import { BomPartView } from "@/components/views/bom/BomPartView";

type BomPartPageProps = {
	params: Promise<{ itemId: string }>;
	searchParams: Promise<{ rev?: string; sku?: string; name?: string }>;
};

export default async function BomPartPage({
	params,
	searchParams,
}: BomPartPageProps) {
	const partId = Number((await params).itemId);
	if (!Number.isInteger(partId) || partId <= 0) notFound();
	const { rev, sku, name } = await searchParams;
	return (
		<BomPartView partId={partId} rev={rev} hintSku={sku} hintName={name} />
	);
}
