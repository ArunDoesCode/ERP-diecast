import { notFound } from "next/navigation";

import { ScoFormView } from "@/components/views/subcontracting/ScoFormView";

type EditScoPageProps = {
	params: Promise<{ scoId: string }>;
};

export default async function EditScoPage({ params }: EditScoPageProps) {
	const scoId = Number((await params).scoId);
	if (Number.isNaN(scoId) || scoId <= 0) notFound();

	return <ScoFormView scoId={scoId} />;
}
