"use client";

import { NoAccessState } from "@/components/shared/NoAccessState";
import { PageHeader } from "@/components/shared/PageHeader";
import { useBreadcrumbLast } from "@/lib/shell/breadcrumb-last";
import { permissionForPath } from "@/lib/shell/screen-permissions";

/** Home page. A `denied` path means the shell sent the user here from a screen they cannot open. */
const LandingView = ({ denied }: { denied?: string }) => {
	useBreadcrumbLast(denied ? "No access" : undefined);
	if (denied) {
		return (
			<NoAccessState path={denied} permission={permissionForPath(denied)} />
		);
	}
	return (
		<PageHeader
			title="Home"
			description="Pick a screen from the menu on the left."
		/>
	);
};

export default LandingView;
