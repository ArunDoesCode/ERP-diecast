import LandingView from "@/components/views/landing/LandingView";

export default async function LandingPage({
	searchParams,
}: {
	searchParams: Promise<{ denied?: string }>;
}) {
	const { denied } = await searchParams;
	return <LandingView denied={denied} />;
}
