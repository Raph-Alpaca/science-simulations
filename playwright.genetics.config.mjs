import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/genetics', timeout: 20000, globalTimeout: 180000,
  retries: 0, workers: 1, maxFailures: 5,
  outputDir: '.local/evidence/genetics03/browser-results',
  reporter: [['list'], ['html', { outputFolder: '.local/evidence/genetics03/browser-report', open: 'never' }]],
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4177/science-simulations/', viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node automation/catalog/preview-genetics.mjs --port 4177', url: 'http://127.0.0.1:4177/science-simulations/', reuseExistingServer: false, timeout: 30000 }
});
