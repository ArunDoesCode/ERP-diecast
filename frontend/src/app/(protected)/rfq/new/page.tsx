import { RfqFormView } from "@/components/views/rfq/RfqFormView";

type NewRfqPageProps = {
	searchParams: Promise<{ pr?: string }>;
};

export default async function NewRfqPage({ searchParams }: NewRfqPageProps) {
	const parsed = Number((await searchParams).pr);
	return (
		<RfqFormView
			prId={Number.isInteger(parsed) && parsed > 0 ? parsed : undefined}
		/>
	);
}
