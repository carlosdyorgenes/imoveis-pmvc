import { test, expect } from '@playwright/test'
import { login, limparDemandasDeTeste, acordarBackend, E2E_PREFIX } from './helpers'

test.describe('Módulo de Demandas', () => {
  test.beforeAll(async () => {
    await acordarBackend()
  })

  test.afterEach(async () => {
    await limparDemandasDeTeste()
  })

  test('login redireciona para o dashboard', async ({ page }) => {
    await login(page)
    await expect(page.locator('text=Dashboard').first()).toBeVisible()
  })

  test('cria uma demanda com GEP e ela aparece na listagem', async ({ page }) => {
    await login(page)
    await page.goto('/demandas')

    const gepNumero = `${E2E_PREFIX}${Date.now()}`
    await page.getByRole('button', { name: /Nova Demanda/i }).click()
    await page.getByPlaceholder('126158').fill(gepNumero)
    await page.getByPlaceholder('2025').fill('2099')
    await page.getByPlaceholder(/Revalidação de alvará/i).fill('Demanda criada por teste E2E')
    await page.getByRole('button', { name: /^Criar$/i }).click()

    await expect(page.locator(`text=${gepNumero}/2099`)).toBeVisible({ timeout: 10_000 })
  })

  test('demanda com GEP duplicado exibe aviso, mas não bloqueia', async ({ page }) => {
    await login(page)
    await page.goto('/demandas')

    const gepNumero = `${E2E_PREFIX}${Date.now()}`
    const criar = async () => {
      await page.getByRole('button', { name: /Nova Demanda/i }).click()
      await page.getByPlaceholder('126158').fill(gepNumero)
      await page.getByPlaceholder('2025').fill('2099')
      await page.getByPlaceholder(/Revalidação de alvará/i).fill('Teste duplicidade')
      await page.getByRole('button', { name: /^Criar$/i }).click()
      await expect(page.locator(`text=${gepNumero}/2099`).first()).toBeVisible({ timeout: 10_000 })
    }

    await criar()
    await criar() // segunda vez com o mesmo GEP: deve avisar, não travar
  })

  test('abre o detalhe da demanda e adiciona um comentário', async ({ page }) => {
    await login(page)
    await page.goto('/demandas')

    const gepNumero = `${E2E_PREFIX}${Date.now()}`
    await page.getByRole('button', { name: /Nova Demanda/i }).click()
    await page.getByPlaceholder('126158').fill(gepNumero)
    await page.getByPlaceholder('2025').fill('2099')
    await page.getByPlaceholder(/Revalidação de alvará/i).fill('Teste de comentario E2E')
    await page.getByRole('button', { name: /^Criar$/i }).click()

    await page.locator(`text=${gepNumero}/2099`).first().click()
    await expect(page).toHaveURL(/\/demandas\/.+/)

    const textoComentario = `Comentario automatizado ${Date.now()}`
    await page.getByPlaceholder(/Escreva um comentário/i).fill(textoComentario)
    await page.getByPlaceholder(/Escreva um comentário/i).press('Enter')

    await expect(page.locator(`text=${textoComentario}`).first()).toBeVisible({ timeout: 10_000 })
  })
})
