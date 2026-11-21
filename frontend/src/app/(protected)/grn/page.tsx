import { Suspense } from "react";

import { GrnView } from "@/components/views/grn/GrnView";

// The list keeps its filters in the URL (nuqs), which needs a Suspense boundary.
export default function GrnPage() {
	return (
		<Suspense fallback={null}>
			<GrnView />
		</Suspense>
	);
}
