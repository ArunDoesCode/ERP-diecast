import { redirect } from "next/navigation";

// BR-FF-102: /landing is the old address of Home. A `denied` path (the shell
// sent the user away from a screen they cannot open) is carried over.
export default async function LandingPage({
	searchParams,
}: {
	searchParams: Promise<{ denied?: string }>;
}) {
	const { denied } = await searchParams;
	redirect(denied ? `/home?denied=${encodeURIComponent(denied)}` : "/home");
}
