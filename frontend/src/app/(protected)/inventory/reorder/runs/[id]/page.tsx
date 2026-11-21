import { notFound } from "next/navigation";

import { ReorderRunDetailView } from "@/components/views/reorder/ReorderRunDetailView";

type ReorderRunPageProps = {
	params: Promise<{ id: string }>;
};

export default async function ReorderRunPage({ params }: ReorderRunPageProps) {
	const runId = Number((await params).id);
	if (!Number.isInteger(runId) || runId <= 0) notFound();
	return <ReorderRunDetailView runId={runId} />;
}
