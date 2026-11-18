/**
 * docs/specs/design-system/spec.md (v1): BR-DS-16 (default comfortable; choice kept per browser,
 * `data-density` on <html>). bun test has no DOM, so window/localStorage/document are stubbed.
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import {
	applyDensity,
	DEFAULT_DENSITY,
	DENSITY_ATTRIBUTE,
	DENSITY_STORAGE_KEY,
	readDensity,
	writeDensity,
} from "@/lib/shell/density";

const g = globalThis as Record<string, unknown>;
const saved = {
	window: g.window,
	localStorage: g.localStorage,
	document: g.document,
};

let store: Map<string, string>;
let attrs: Map<string, string>;

function install() {
	store = new Map();
	attrs = new Map();
	const localStorage = {
		getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
		setItem: (k: string, v: string) => void store.set(k, String(v)),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear(),
	};
	const dataset = new Proxy(
		{},
		{
			get: (_t, p) => attrs.get(`data-${String(p)}`),
			set: (_t, p, v) => {
				attrs.set(`data-${String(p)}`, String(v));
				return true;
			},
		},
	);
	const documentElement = {
		setAttribute: (k: string, v: string) => void attrs.set(k, String(v)),
		getAttribute: (k: string) =>
			attrs.has(k) ? (attrs.get(k) as string) : null,
		removeAttribute: (k: string) => void attrs.delete(k),
		dataset,
	};
	g.localStorage = localStorage;
	g.document = { documentElement };
	g.window = { localStorage, document: g.document };
}

beforeEach(install);
afterAll(() => {
	g.window = saved.window;
	g.localStorage = saved.localStorage;
	g.document = saved.document;
});

describe("density", () => {
	test("BR-DS-16 the default is comfortable", () => {
		expect(DEFAULT_DENSITY).toBe("comfortable");
		expect(readDensity()).toBe("comfortable");
	});

	test("BR-DS-16 an invalid saved value falls back to comfortable", () => {
		store.set(DENSITY_STORAGE_KEY, "huge");
		expect(readDensity()).toBe("comfortable");
	});

	test("BR-DS-16 writeDensity keeps the choice and sets data-density on <html>", () => {
		writeDensity("compact");
		expect(store.get(DENSITY_STORAGE_KEY)).toBe("compact");
		expect(attrs.get(DENSITY_ATTRIBUTE)).toBe("compact");
		expect(readDensity()).toBe("compact");
	});

	test("BR-DS-16 applyDensity sets the attribute from the saved value without writing", () => {
		store.set(DENSITY_STORAGE_KEY, "compact");
		expect(applyDensity()).toBe("compact");
		expect(attrs.get(DENSITY_ATTRIBUTE)).toBe("compact");
	});

	test("BR-DS-16 applyDensity with nothing saved applies comfortable", () => {
		expect(applyDensity()).toBe("comfortable");
		expect(attrs.get(DENSITY_ATTRIBUTE)).toBe("comfortable");
	});

	test("BR-DS-16 storage key and attribute names match the contract", () => {
		expect(DENSITY_STORAGE_KEY).toBe("diecast.density");
		expect(DENSITY_ATTRIBUTE).toBe("data-density");
	});
});
