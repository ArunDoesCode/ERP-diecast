import { ModulePageShell } from "@/components/common/ModulePageShell";
import { getPageDefinition } from "@/lib/navigation/pages";

export function PayrollAttendanceView() {
	const page = getPageDefinition("/payroll-attendance");

	if (!page) {
		throw new Error("Missing page definition for /payroll-attendance");
	}

	return <ModulePageShell page={page} />;
}
