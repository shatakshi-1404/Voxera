import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.beforeEach(async ({ page }) => { await login(page) })

test('knowledge search tester returns scored hits', async ({ page }) => {
  await page.goto('/knowledge')
  await expect(page.getByText('Return and Refund Policy')).toBeVisible()
  await page.getByLabel('Test query').fill('return policy refund 30 days')
  await page.getByLabel('Test query').press('Enter')
  await expect(page.getByText(/score \d/).first()).toBeVisible()
})

test('customer 360 shows orders and the activity timeline', async ({ page }) => {
  await page.goto('/customers')
  await page.getByRole('link', { name: /Ananya Sharma/ }).click()
  await expect(page.getByText('Activity timeline')).toBeVisible()
  await page.getByRole('tab', { name: 'Orders' }).click()
  await expect(page.getByText('VX-10284')).toBeVisible()
  await expect(page.getByText(/Visa •••• 4242/).first()).toBeVisible()
})

test('playground scenario runs against the real agent and passes evaluation', async ({ page }) => {
  await page.goto('/playground')
  await page.getByRole('button', { name: /Delayed order/ }).click()
  await expect(page.getByText(/1\/1 passed/)).toBeVisible({ timeout: 45_000 })
})

test('insights studio renders KPI cards and charts', async ({ page }) => {
  await page.goto('/insights')
  await expect(page.getByText('AI containment')).toBeVisible()
  await expect(page.getByText('Conversations over time')).toBeVisible()
  await expect(page.locator('.recharts-wrapper').first()).toBeVisible()
})

test('tickets: SLA column and ticket drawer', async ({ page }) => {
  await page.goto('/tickets')
  // a fresh seed has no tickets: create one through the UI so this test is self-contained
  await page.getByRole('button', { name: 'New ticket' }).click()
  await page.getByRole('dialog').getByRole('textbox').first().fill('E2E: package arrived damaged')
  await page.getByRole('button', { name: 'Create ticket' }).click()
  await expect(page.getByRole('columnheader', { name: 'SLA' })).toBeVisible()
  await page.getByRole('row').filter({ hasText: 'E2E: package arrived damaged' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByText('Resolution note')).toBeVisible()
})

test('keyboard shortcut g then i opens the inbox', async ({ page }) => {
  await page.keyboard.press('g')
  await page.keyboard.press('i')
  await expect(page).toHaveURL(/\/inbox/)
})

test('theme toggles and persists across reload (design is dark by default)', async ({ page }) => {
  const html = page.locator('html')
  const wasDark = await html.evaluate((el) => el.classList.contains('dark'))
  await page.getByRole('button', { name: 'Toggle dark mode' }).click()
  await expect(html).toHaveClass(wasDark ? /^((?!dark).)*$/ : /dark/)
  await page.reload()
  await expect(html).toHaveClass(wasDark ? /^((?!dark).)*$/ : /dark/)
})
