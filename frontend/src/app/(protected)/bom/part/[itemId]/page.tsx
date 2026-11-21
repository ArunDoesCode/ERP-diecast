import { notFound } from "next/navigation";

import { BomPartView } from "@/components/views/bom/BomPartView";

type BomPartPageProps = {
	params: Promise<{ itemId: string }>;
	searchParams: Promise<{ rev?: string }>;
};

export default async function BomPartPage({
	params,
	searchParams,
}: BomPartPageProps) {
	const partId = Number((await params).itemId);
	if (!Number.isInteger(partId) || partId <= 0) notFound();
	const { rev } = await searchParams;
	return <BomPartView partId={partId} rev={rev} />;
}
