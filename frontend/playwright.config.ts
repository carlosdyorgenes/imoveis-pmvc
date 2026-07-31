import { defineConfig, devices } from '@playwright/test'

// Testes E2E rodam contra um servidor Next.js local (build de produção),
// mas apontando para a API real de produção (mesma NEXT_PUBLIC_API_URL usada
// no deploy). Por isso os testes usam um GEP com prefixo "E2E-" e sempre
// limpam os dados criados ao final (ver e2e/fixtures.ts).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    // Por padrão roda contra o site em produção: a API só libera CORS para o
    // domínio do Vercel, então localhost não consegue autenticar contra ela.
    baseURL: process.env.E2E_BASE_URL || 'https://imoveis-pmvc.vercel.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
