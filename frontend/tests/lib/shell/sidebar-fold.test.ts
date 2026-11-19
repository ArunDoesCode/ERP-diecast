/** docs/specs/design-system/spec.md (v1): "Shell" > Sidebar fold (state kept in localStorage). */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	readSidebarFolded,
	SIDEBAR_FOLD_STORAGE_KEY,
	writeSidebarFolded,
} from "@/lib/shell/sidebar-fold";

const g = globalThis as Record<string, unknown>;
const saved = { window: g.window, localStorage: g.localStorage };
let store: Map<string, string>;

beforeEach(() => {
	store = new Map();
	const localStorage = {
		getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
		setItem: (k: string, v: string) => void store.set(k, String(v)),
		removeItem: (k: string) => void store.delete(k),
	};
	g.localStorage = localStorage;
	g.window = { localStorage };
});
afterAll(() => {
	g.window = saved.window;
	g.localStorage = saved.localStorage;
});

describe("sidebar fold", () => {
	test("Shell table (SPEC-S4) the sidebar is unfolded by default", () => {
		expect(readSidebarFolded()).toBe(false);
	});

	test("Shell table (SPEC-S4) the fold state is kept as the strings true / false", () => {
		writeSidebarFolded(true);
		expect(store.get(SIDEBAR_FOLD_STORAGE_KEY)).toBe("true");
		expect(readSidebarFolded()).toBe(true);
		writeSidebarFolded(false);
		expect(store.get(SIDEBAR_FOLD_STORAGE_KEY)).toBe("false");
		expect(readSidebarFolded()).toBe(false);
	});
});
