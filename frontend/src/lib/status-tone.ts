/**
 * One map: document status -> label, tone, icon. Spec: docs/specs/design-system (BR-DS-03, BR-DS-04).
 * Stubs: bodies land in slice B.
 */
import type { Icon } from "@tabler/icons-react";

export type Tone =
	| "neutral"
	| "warning"
	| "info"
	| "success"
	| "danger"
	| "closed";

export type StatusDoc =
	| "pr"
	| "po"
	| "grn"
	| "grnQa"
	| "sco"
	| "challanDue"
	| "approval";

export type StatusTone = {
	label: string;
	tone: Tone;
	/** Tabler icon component for the tone (shown before the label, aria-hidden). */
	icon: Icon;
};

/** Icon per tone: neutral IconCircleDashed, warning IconClock, info IconArrowRight,
 * success IconCheck, danger IconAlertTriangle, closed IconArchive. */
export type ToneIconMap = Record<Tone, Icon>;

export const TONE_ICONS: ToneIconMap = undefined as unknown as ToneIconMap;

/** Label, tone and icon for a status. Unknown or null status -> neutral "Unknown"; never throws. */
export function getStatusTone(
	_doc: StatusDoc,
	_status: string | null | undefined,
): StatusTone {
	throw new Error("not implemented");
}
