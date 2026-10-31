import { defineConfig, devices } from '@playwright/test';

// This suite uses an in-memory Auth/PostgREST fixture, never a real project.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
export default defineConfig({
  testDir: './tests/admin-e2e',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3200',
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : undefined
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'node tests/fixtures/mock-admin-auth.mjs', url: 'http://127.0.0.1:3201/health', reuseExistingServer: false, timeout: 30_000 },
    {
      command: 'npm run dev -- --port 3200', url: 'http://127.0.0.1:3200/admin/login', reuseExistingServer: false, timeout: 120_000,
      env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:3201', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key' }
    }
  ]
});
