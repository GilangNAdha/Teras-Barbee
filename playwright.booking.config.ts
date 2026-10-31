import { defineConfig, devices } from '@playwright/test';

// A separate test server uses an in-memory Supabase fixture; it never touches
// a real project. The normal public-site tests use playwright.config.ts.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
  testDir: './tests/booking-e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : undefined
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tests/fixtures/mock-supabase.mjs', url: 'http://127.0.0.1:3101/health', reuseExistingServer: false, timeout: 30_000 },
    {
      command: 'npm run dev -- --port 3100', url: 'http://127.0.0.1:3100/book', reuseExistingServer: false, timeout: 120_000,
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3101', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', BOOKING_HASH_SECRET: 'fixture-only-secret-with-at-least-32-characters', NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3100' }
    }
  ]
});
