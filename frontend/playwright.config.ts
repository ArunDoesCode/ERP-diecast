import { defineConfig, devices } from "@playwright/test";

// End-to-end tests for the UI. Specs live in `e2e/` and are written only by the test-writer agent.
// Run: `bun run e2e` (see e2e/README.md). The API (:4000) must already be running with demo data,
// e.g. via `bun run try` from `backend/`; the UI on :3000 is reused if up, started if not.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(baseURL);

export default defineConfig({
	testDir: "e2e",
	outputDir: "test-results",
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [["list"], ["html", { open: "never" }]],
	use: {
		baseURL,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	projects: [
		{
			name: "desktop",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1440, height: 900 },
			},
		},
		{
			name: "tablet",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1024, height: 768 },
			},
		},
	],
	// A remote E2E_BASE_URL is tested as it is; nothing is started for it.
	...(isLocal
		? {
				webServer: {
					command: "bun run dev",
					url: baseURL,
					reuseExistingServer: true,
					timeout: 120_000,
				},
			}
		: {}),
});
