import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";

/** Home page. A `denied` flag means the shell sent the user here from a screen they cannot open. */
const LandingView = ({ denied }: { denied?: boolean }) => {
	if (denied) return <NoAccessState />;
	return (
		<PageHeader
			title="Home"
			description="Pick a screen from the menu on the left."
		/>
	);
};

export default LandingView;
