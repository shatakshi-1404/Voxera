import { expect, test } from '@playwright/test'
import { login } from './helpers'

test.use({ viewport: { width: 390, height: 800 } })

test('mobile: sidebar collapses behind a menu button and navigation works', async ({ page }) => {
  await login(page)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await page.getByRole('button', { name: 'Open menu' }).click()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Inbox' }).click()
  await expect(page).toHaveURL(/\/inbox/)
  await expect(page.getByPlaceholder(/Search conversations/)).toBeVisible()
})

test('mobile: public chat page is usable', async ({ page }) => {
  await page.goto('/chat/demo')
  await expect(page.getByRole('button', { name: 'Start chat' })).toBeVisible()
})
