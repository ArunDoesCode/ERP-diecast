/**
 * docs/specs/design-system/spec.md (v1): BR-DS-07, BR-DS-08, BR-DS-12, BR-DS-14, BR-DS-17, BR-DS-18,
 * BR-DS-19, BR-DS-27 and the "Name, keyboard and states" table for PageHeader, DetailHeader,
 * DocumentFlow, FilterBar, Pagination, EmptyState, ErrorState, StatusFlashRow, DataTable.
 * Contract: .pipeline/design-system-po/contract.md. Server-rendered to static HTML.
 * Written by test-writer from the spec only.
 */
import { describe, expect, test } from "bun:test";
import { IconInbox } from "@tabler/icons-react";
import { useTable } from "@tanstack/react-table";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "@/components/common/DataTable";
import {
	type DataTableColumnDef,
	dataTableFeatures,
} from "@/components/common/data-table-features";
import { DetailHeader } from "@/components/shared/DetailHeader";
import { DocumentFlow } from "@/components/shared/DocumentFlow";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { FilterBar } from "@/components/shared/FilterBar";
import { PageHeader } from "@/components/shared/PageHeader";
import { Pagination } from "@/components/shared/Pagination";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
	StatusFlashRow,
	type StatusFlashRowProps,
} from "@/components/shared/StatusFlashRow";
import { getStatusTone, type StatusDoc } from "@/lib/status-tone";

const noop = () => {};
const render = (node: ReactNode) => renderToStaticMarkup(node as never);
const text = (m: string) => m.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const QUICK = [
	{ key: "all", label: "All", count: 41 },
	{ key: "pending", label: "Pending", count: 7 },
	{ key: "approved", label: "Approved" },
];
const filterBar = (value: string, extra = {}) =>
	render(
		createElement(FilterBar, { quick: QUICK, value, onChange: noop, ...extra }),
	);
/** The opening tag of the button whose label is `label`. */
const chip = (m: string, label: string) =>
	m.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${label}`))?.[0] ??
	"";

describe("BR-DS-07 selection and position use the accent; statuses never do", () => {
	test("BR-DS-07 selected quick filter has aria-pressed=true and the accent token; others do not", () => {
		const m = filterBar("pending");
		const sel = chip(m, "Pending");
		expect(sel).toContain('aria-pressed="true"');
		expect(sel).toContain("brand-accent");
		const other = chip(m, "Approved");
		expect(other).toContain('aria-pressed="false"');
		expect(other).not.toContain("brand-accent");
	});

	test("BR-DS-07 current page number has aria-current=page and the accent token", () => {
		const m = render(
			createElement(Pagination, {
				page: 2,
				pageSize: 25,
				total: 100,
				onPageChange: noop,
			}),
		);
		const cur = m.match(/<[a-z]+[^>]*aria-current="page"[^>]*>/)?.[0] ?? "";
		expect(cur).toContain("brand-accent");
	});

	test("BR-DS-07 current document-flow step has aria-current=step; todo step has no accent", () => {
		const m = render(
			createElement(DocumentFlow, {
				steps: [
					{ label: "Requisition", docNo: "PR-1", state: "done" },
					{ label: "Purchase order", docNo: "PO-1", state: "current" },
					{ label: "Goods receipt", state: "todo" },
				],
			}),
		);
		expect(m).toContain('aria-current="step"');
		const todoLi =
			m.match(/<li[^>]*>(?:(?!<\/li>)[\s\S])*Goods receipt/)?.[0] ?? "";
		expect(todoLi).not.toContain("brand-accent");
	});

	test("BR-DS-07 no StatusBadge, for any status of any document, uses the accent", () => {
		const docs: Array<[StatusDoc, string]> = [
			["po", "dispatched"],
			["po", "approved"],
			["pr", "pending_approval"],
			["grn", "rejected"],
			["sco", "closed"],
			["challanDue", "overdue"],
			["approval", "auto_approved"],
			["po", "on_hold"],
		];
		for (const [doc, status] of docs) {
			const m = render(createElement(StatusBadge, { doc, status }));
			expect(m).not.toContain("accent");
		}
	});
});

describe("BR-DS-08 danger tone is for refused, failed or late statuses only", () => {
	const DANGER: Array<[StatusDoc, string]> = [
		["pr", "rejected"],
		["grn", "rejected"],
		["grnQa", "failed"],
		["sco", "rejected"],
		["challanDue", "overdue"],
		["approval", "rejected"],
	];
	const NOT_DANGER: Array<[StatusDoc, string]> = [
		["po", "dispatched"],
		["po", "cancelled"],
		["po", "closed"],
		["pr", "cancelled"],
		["sco", "require_more_info"],
		["grn", "partial_accepted"],
		["grnQa", "waived"],
		["challanDue", "warning"],
	];
	test("BR-DS-08 refused / failed / late statuses are danger", () => {
		for (const [doc, status] of DANGER) {
			expect(getStatusTone(doc, status).tone).toBe("danger");
		}
	});
	test("BR-DS-08 cancelled, closed, sent-back and in-progress statuses are not danger", () => {
		for (const [doc, status] of NOT_DANGER) {
			expect(getStatusTone(doc, status).tone).not.toBe("danger");
		}
	});
	test("BR-DS-08 ErrorState colours only the icon with danger, not the whole block", () => {
		const m = render(createElement(ErrorState, { message: "Server said no" }));
		// The role=alert wrapper itself carries no danger fill.
		const wrapper = m.match(/<[a-z]+[^>]*role="alert"[^>]*>/)?.[0] ?? "";
		expect(wrapper).not.toMatch(/bg-(danger|destructive)/);
	});
});

describe("BR-DS-17 the non-data states", () => {
	test("BR-DS-17 EmptyState is role=status, title is a p (not a heading), description shown", () => {
		const m = render(
			createElement(EmptyState, {
				icon: IconInbox,
				title: "No purchase orders yet",
				description: "Create the first one.",
			}),
		);
		expect(m).toContain('role="status"');
		expect(m).toMatch(/<p[^>]*>No purchase orders yet<\/p>/);
		expect(m).not.toMatch(/<h[1-6]/);
		expect(text(m)).toContain("Create the first one.");
	});

	test("BR-DS-17 EmptyState puts the action in the only Tab stop", () => {
		const m = render(
			createElement(EmptyState, {
				title: "No purchase orders yet",
				action: createElement(
					"button",
					{ type: "button" },
					"New purchase order",
				),
			}),
		);
		expect(m.match(/<button/g)?.length).toBe(1);
		expect(m).not.toMatch(/<a[\s>]/);
	});

	test("BR-DS-17 ErrorState is role=alert, shows the message and a 'Try again' button only with onRetry", () => {
		const withRetry = render(
			createElement(ErrorState, { message: "Server said no", onRetry: noop }),
		);
		expect(withRetry).toContain('role="alert"');
		expect(text(withRetry)).toContain("Server said no");
		expect(withRetry).toMatch(/<button[^>]*>[^<]*Try again/);
		const without = render(
			createElement(ErrorState, { message: "Server said no" }),
		);
		expect(without).not.toContain("Try again");
	});

	test("BR-DS-17 ErrorState while retrying: button disabled and reads 'Trying…'", () => {
		const m = render(
			createElement(ErrorState, {
				message: "x",
				onRetry: noop,
				retrying: true,
			}),
		);
		expect(m).toMatch(/<button[^>]*disabled/);
		expect(text(m)).toContain("Trying…");
	});

	test("BR-DS-17 Pagination: nav 'Pagination', text '1 to 25 of 41', arrows named and aria-disabled at the ends", () => {
		const m = render(
			createElement(Pagination, {
				page: 1,
				pageSize: 25,
				total: 41,
				onPageChange: noop,
			}),
		);
		expect(m).toMatch(/<nav[^>]*aria-label="Pagination"/);
		expect(text(m)).toContain("1 to 25 of 41");
		expect(m).toMatch(/aria-label="Previous page"/);
		expect(m).toMatch(/aria-label="Next page"/);
		const prev =
			m.match(/<[a-z]+[^>]*aria-label="Previous page"[^>]*>/)?.[0] ?? "";
		expect(prev).toContain('aria-disabled="true"');
		const next = m.match(/<[a-z]+[^>]*aria-label="Next page"[^>]*>/)?.[0] ?? "";
		expect(next).not.toContain('aria-disabled="true"');
	});

	test("BR-DS-17 Pagination is not rendered when total fits one page", () => {
		const m = render(
			createElement(Pagination, {
				page: 1,
				pageSize: 25,
				total: 25,
				onPageChange: noop,
			}),
		);
		expect(m).not.toContain("Pagination");
		expect(m).not.toContain("<nav");
	});

	test("BR-DS-17 FilterBar: toolbar named 'Filters'; counts show '–' when undefined", () => {
		const m = filterBar("all");
		expect(m).toMatch(
			/role="toolbar"[^>]*aria-label="Filters"|aria-label="Filters"[^>]*role="toolbar"/,
		);
		expect(text(`${chip(m, "Approved")}</button>`)).toContain("–");
		expect(text(m)).toContain("41");
	});

	test("BR-DS-17 FilterBar: 'Reset' only appears when a filter is active", () => {
		expect(text(filterBar("all", { onReset: noop }))).not.toContain("Reset");
		expect(text(filterBar("pending", { onReset: noop }))).toContain("Reset");
	});

	test("BR-DS-17 PageHeader: header with exactly one h1 and the title", () => {
		const m = render(
			createElement(PageHeader, {
				title: "Purchase orders",
				description: "All orders",
			}),
		);
		expect(m).toMatch(/<header/);
		expect(m.match(/<h1/g)?.length).toBe(1);
		expect(text(m)).toContain("Purchase orders");
	});

	test("BR-DS-17 PageHeader: actions sit in a group named 'Page actions'", () => {
		const m = render(
			createElement(PageHeader, {
				title: "Purchase orders",
				actions: createElement(
					"button",
					{ type: "button" },
					"New purchase order",
				),
			}),
		);
		expect(m).toMatch(
			/role="group"[^>]*aria-label="Page actions"|aria-label="Page actions"[^>]*role="group"/,
		);
	});

	test("BR-DS-17 DocumentFlow: nav 'Document chain' > ol; linked step is a link; todo step is not a Tab stop", () => {
		const m = render(
			createElement(DocumentFlow, {
				steps: [
					{ label: "Requisition", docNo: "PR-1", href: "/pr/1", state: "done" },
					{ label: "Purchase order", docNo: "PO-1", state: "current" },
					{ label: "Goods receipt", state: "todo" },
				],
			}),
		);
		expect(m).toMatch(/<nav[^>]*aria-label="Document chain"/);
		expect(m).toMatch(/<ol/);
		expect(m).toMatch(/<a[^>]*href="\/pr\/1"/);
		const todoLi =
			m.match(
				/<li[^>]*>(?:(?!<\/li>)[\s\S])*Goods receipt[\s\S]*?<\/li>/,
			)?.[0] ?? "";
		expect(todoLi).not.toMatch(/<a[\s>]|<button|tabindex="0"/);
	});

	test("BR-DS-17 DocumentFlow with one step renders nothing", () => {
		const m = render(
			createElement(DocumentFlow, {
				steps: [{ label: "Purchase order", state: "current" }],
			}),
		);
		expect(m).toBe("");
	});

	test("BR-DS-17 DocumentFlow error: 'Could not load the chain' and a 'Try again' button", () => {
		const m = render(
			createElement(DocumentFlow, { steps: [], error: true, onRetry: noop }),
		);
		expect(text(m)).toContain("Could not load the chain");
		expect(m).toMatch(/<button[^>]*>[^<]*Try again/);
	});

	test("BR-DS-17 DetailHeader: h1 is the doc number, back link 'Back to <label>', meta is a dl", () => {
		const m = render(
			createElement(DetailHeader, {
				docNo: "PO-2026-0190",
				status: createElement(StatusBadge, { doc: "po", status: "approved" }),
				meta: [{ label: "Supplier", value: "Acme Metals" }],
				backHref: "/purchase-orders",
				backLabel: "purchase orders",
			}),
		);
		expect(m).toMatch(/<h1[^>]*>[^<]*PO-2026-0190/);
		expect(m).toMatch(
			/<a[^>]*href="\/purchase-orders"[^>]*>(?:(?!<\/a>)[\s\S])*Back to purchase orders|aria-label="Back to purchase orders"/,
		);
		expect(m).toMatch(/<dl/);
		expect(text(m)).toContain("Acme Metals");
	});
});

type Row = { docNo: string; value: number };
function TableHarness(props: {
	rows: Row[];
	isLoading?: boolean;
	emptyState?: ReactNode;
	errorState?: ReactNode;
	skeletonRows?: number;
}) {
	const columns: DataTableColumnDef<Row>[] = [
		{ accessorKey: "docNo", header: "PO no." },
		{ accessorKey: "value", header: "Value" },
	];
	const table = useTable({
		features: dataTableFeatures,
		data: props.rows,
		columns,
	});
	return createElement(DataTable<Row>, {
		table,
		isLoading: props.isLoading,
		emptyState: props.emptyState,
		errorState: props.errorState,
		skeletonRows: props.skeletonRows,
	});
}
const table = (p: Parameters<typeof TableHarness>[0]) =>
	render(createElement(TableHarness, p));

describe("BR-DS-14 skeleton sweep runs only while loading", () => {
	test("BR-DS-14 loading renders 8 skeleton rows by default, aria-busy, with the sweep", () => {
		const m = table({ rows: [], isLoading: true });
		expect(m).toContain('aria-busy="true"');
		expect(m.match(/animate-skeleton/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
		// 1 header row + 8 skeleton rows
		expect(m.match(/<tr/g)?.length).toBe(9);
	});

	test("BR-DS-14 skeletonRows overrides the count", () => {
		const m = table({ rows: [], isLoading: true, skeletonRows: 3 });
		expect(m.match(/<tr/g)?.length).toBe(4);
	});

	test("BR-DS-14 with data there is no sweep and no aria-busy", () => {
		const m = table({ rows: [{ docNo: "PO-1", value: 100 }] });
		expect(m).not.toContain("animate-skeleton");
		expect(m).not.toContain('aria-busy="true"');
		expect(text(m)).toContain("PO-1");
	});

	test("BR-DS-14 empty state: no sweep", () => {
		const m = table({
			rows: [],
			emptyState: createElement(EmptyState, {
				title: "No purchase orders yet",
			}),
		});
		expect(m).not.toContain("animate-skeleton");
		expect(m).not.toContain('aria-busy="true"');
	});

	test("BR-DS-14 error state: no sweep", () => {
		const m = table({
			rows: [],
			errorState: createElement(ErrorState, { message: "boom" }),
		});
		expect(m).not.toContain("animate-skeleton");
	});
});

describe("BR-DS-17 DataTable slots", () => {
	test("BR-DS-17 th has scope=col", () => {
		expect(table({ rows: [] })).toMatch(/<th[^>]*scope="col"/);
	});

	test("BR-DS-17 empty with emptyState shows it, not 'No results.'", () => {
		const m = table({
			rows: [],
			emptyState: createElement(EmptyState, {
				title: "No purchase orders yet",
			}),
		});
		expect(text(m)).toContain("No purchase orders yet");
		expect(text(m)).not.toContain("No results.");
	});

	test("BR-DS-17 empty without emptyState falls back to 'No results.'", () => {
		expect(text(table({ rows: [] }))).toContain("No results.");
	});

	test("BR-DS-17 errorState replaces the body (no data rows)", () => {
		const m = table({
			rows: [{ docNo: "PO-1", value: 1 }],
			errorState: createElement(ErrorState, { message: "boom" }),
		});
		expect(text(m)).toContain("boom");
		expect(text(m)).not.toContain("PO-1");
	});
});

describe("BR-DS-19 document numbers are mono, numbers are tabular", () => {
	test("BR-DS-19 DetailHeader document number uses the mono font", () => {
		const m = render(
			createElement(DetailHeader, {
				docNo: "PO-2026-0190",
				status: null,
				backHref: "/x",
				backLabel: "x",
			}),
		);
		const h1 = m.match(/<h1[^>]*>/)?.[0] ?? "";
		expect(h1).toContain("font-mono");
	});

	test("BR-DS-19 DocumentFlow step document numbers use the mono font", () => {
		const m = render(
			createElement(DocumentFlow, {
				steps: [
					{ label: "Requisition", docNo: "PR-2026-0001", state: "done" },
					{ label: "Purchase order", docNo: "PO-2026-0190", state: "current" },
				],
			}),
		);
		const el = m.match(/<[a-z]+[^>]*font-mono[^>]*>[^<]*PO-2026-0190/)?.[0];
		expect(el).toBeDefined();
	});

	test("BR-DS-19 FilterBar counts and the Pagination range use tabular numbers", () => {
		expect(filterBar("all")).toContain("tabular-nums");
		const m = render(
			createElement(Pagination, {
				page: 1,
				pageSize: 25,
				total: 41,
				onPageChange: noop,
			}),
		);
		expect(m).toContain("tabular-nums");
	});
});

describe("BR-DS-18 shared components format through format.ts", () => {
	test("BR-DS-18 Pagination range text matches formatPageRange output (no locale grouping of its own)", () => {
		const m = render(
			createElement(Pagination, {
				page: 1,
				pageSize: 25,
				total: 1500,
				onPageChange: noop,
			}),
		);
		expect(text(m)).toContain("1 to 25 of 1500");
	});
});

describe("BR-DS-27 an element the user may not use is not rendered, no ghost, no gap", () => {
	test("BR-DS-27 PageHeader without actions renders no actions group and no button", () => {
		const m = render(createElement(PageHeader, { title: "Purchase orders" }));
		expect(m).not.toContain("Page actions");
		expect(m).not.toContain("<button");
		expect(m.match(/<h1/g)?.length).toBe(1);
	});

	test("BR-DS-27 DetailHeader without actions renders no actions group, no More menu, no disabled button", () => {
		const m = render(
			createElement(DetailHeader, {
				docNo: "PO-1",
				status: null,
				backHref: "/x",
				backLabel: "x",
			}),
		);
		expect(m).not.toContain("Page actions");
		expect(m).not.toMatch(/More/);
		expect(m).not.toMatch(/disabled/);
	});

	test("BR-DS-27 EmptyState without an action keeps its text and renders no button", () => {
		const m = render(
			createElement(EmptyState, { title: "No purchase orders yet" }),
		);
		expect(text(m)).toContain("No purchase orders yet");
		expect(m).not.toContain("<button");
	});
});

describe("BR-DS-12 StatusFlashRow", () => {
	test("BR-DS-12 first paint (initial mount) does not carry the flash", () => {
		const m = render(
			createElement(
				"table",
				null,
				createElement(
					"tbody",
					null,
					createElement(
						StatusFlashRow,
						{ flashKey: "approved" } as StatusFlashRowProps,
						createElement("td", null, "PO-1"),
					),
				),
			),
		);
		expect(m).not.toContain("animate-status-flash");
		expect(m).toContain("PO-1");
	});

	test("BR-DS-12 the wrapper has no role of its own", () => {
		const m = render(
			createElement(
				"table",
				null,
				createElement(
					"tbody",
					null,
					createElement(
						StatusFlashRow,
						{ flashKey: null } as StatusFlashRowProps,
						createElement("td", null, "PO-1"),
					),
				),
			),
		);
		expect(m).not.toMatch(/role=/);
	});
});
