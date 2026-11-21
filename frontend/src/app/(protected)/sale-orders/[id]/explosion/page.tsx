import { notFound } from "next/navigation";

import { ExplosionView } from "@/components/views/sale-orders/ExplosionView";

type ExplosionPageProps = {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ run?: string }>;
};

export default async function ExplosionPage({
	params,
	searchParams,
}: ExplosionPageProps) {
	const soId = Number((await params).id);
	if (!Number.isInteger(soId) || soId <= 0) notFound();
	const { run } = await searchParams;
	return <ExplosionView soId={soId} run={run} />;
}
