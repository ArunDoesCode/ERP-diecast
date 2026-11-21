import { notFound } from "next/navigation";

import { BomFormView } from "@/components/views/bom/BomFormView";

type EditBomPageProps = {
	params: Promise<{ bomId: string }>;
};

export default async function EditBomPage({ params }: EditBomPageProps) {
	const bomId = Number((await params).bomId);
	if (!Number.isInteger(bomId) || bomId <= 0) notFound();
	return <BomFormView bomId={bomId} />;
}
