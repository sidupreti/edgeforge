// Playwright e2e config — drives the REAL continuous flow in a browser.
//
// Uses system Chrome via `channel: 'chrome'` so no Playwright browser binary
// download is needed. Reuses already-running dev servers if present; otherwise
// starts the CRA dev server (this repo) and the FastAPI backend (sibling repo
// ../edgeforge-api). The e2e needs BOTH the frontend (:3000) and backend (:8000).
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./e2e",
  // Feature generation + PELT run on a 60k-row real recording — allow time.
  timeout: 360_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    channel: "chrome", // system Chrome — avoids a browser-binary CDN download
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "off",
  },
  webServer: [
    {
      command: "BROWSER=none npm start",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      // Backend lives in the sibling repo; reused if already running on :8000.
      command:
        "cd ../edgeforge-api && ./venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000",
      url: "http://localhost:8000/openapi.json",
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
