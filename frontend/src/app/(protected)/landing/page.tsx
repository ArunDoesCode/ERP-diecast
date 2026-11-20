import { redirect } from "next/navigation";

// BR-FF-102: /landing is the old address of Home.
export default function LandingPage() {
	redirect("/home");
}
