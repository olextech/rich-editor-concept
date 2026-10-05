import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    // The headless shell has no PDF viewer. Full Chromium exercises PDF frames.
    channel: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "backend/.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001",
      env: {
        PYTHONPATH: "backend",
        DATABASE_URL: "sqlite:///backend/test-templates.db",
        DYLD_FALLBACK_LIBRARY_PATH: "/opt/homebrew/lib",
      },
      url: "http://127.0.0.1:8001/health",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
      env: { API_PROXY_TARGET: "http://127.0.0.1:8001" },
      url: "http://127.0.0.1:5174",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
