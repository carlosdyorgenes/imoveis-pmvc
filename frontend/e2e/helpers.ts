import { Page, expect } from '@playwright/test'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://imoveis-pmvc-api.fly.dev'
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@pmvc.gov.br'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'admin123'

// Prefixo usado em todo dado criado pelos testes E2E, para facilitar limpeza e nunca
// ser confundido com dados reais de produção.
export const E2E_PREFIX = 'E2E'

// A API roda no Fly.io com auto_stop_machines: se ficou ociosa, a primeira requisição
// "acorda" a máquina e pode levar dezenas de segundos. Por isso o timeout generoso aqui.
export async function login(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL)
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })
}

// Acorda a máquina do backend antes da suíte rodar, para o primeiro teste não pagar
// o custo de cold-start sozinho.
export async function acordarBackend() {
  try {
    await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(40_000) })
  } catch { /* segue mesmo assim; login() já tem timeout generoso */ }
}

async function apiToken(): Promise<string> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  })
  const data = await res.json()
  return data.token
}

// Remove definitivamente qualquer demanda de teste (GEP começando com E2E_PREFIX) criada
// durante os testes, para nunca deixar dados de teste acumulados na base de produção.
export async function limparDemandasDeTeste() {
  const token = await apiToken()
  const res = await fetch(`${API_URL}/api/demandas`, { headers: { Authorization: `Bearer ${token}` } })
  const demandas: { id: string; gepNumero: string }[] = await res.json()
  const doTeste = demandas.filter(d => d.gepNumero.startsWith(E2E_PREFIX))
  for (const d of doTeste) {
    await fetch(`${API_URL}/api/demandas/${d.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {})
  }
}
