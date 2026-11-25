import { expect, test } from '@playwright/test'
import { login } from './helpers'

test('analyst sees reports but not the inbox or voice studio', async ({ page }) => {
  await login(page, { email: 'analyst@voxera.dev', password: 'Voxera@123' })
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: 'Insights Studio' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Inbox' })).toHaveCount(0)
  await expect(nav.getByRole('link', { name: 'Voice Studio' })).toHaveCount(0)
})

test('agent sees the inbox but not integrations', async ({ page }) => {
  await login(page, { email: 'agent@voxera.dev', password: 'Voxera@123' })
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: 'Inbox' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Integrations' })).toHaveCount(0)
})
