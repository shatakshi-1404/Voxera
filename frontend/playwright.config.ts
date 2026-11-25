import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests run against the REAL stack:
 *   1) docker compose up -d && cd backend && python -m scripts.seed
 *   2) RATE_LIMIT_ENABLED=false uvicorn app.main:app --port 8000
 *   3) cd frontend && npx playwright install chromium && npm run test:e2e   (Vite is started automatically)
 * Works with or without GROQ_API_KEY (assertions only rely on facts, not exact wording).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 60_000 },
})
