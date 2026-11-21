import HomeView from "@/components/views/home/HomeView";

export default async function HomePage({
	searchParams,
}: {
	searchParams: Promise<{ denied?: string }>;
}) {
	const { denied } = await searchParams;
	return <HomeView denied={denied} />;
}
