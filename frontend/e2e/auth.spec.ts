import { expect, test } from '@playwright/test'
import { ADMIN, login } from './helpers'

test('rejects a wrong password and shows the error', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText(/invalid/i)
})

test('validates the email format before calling the API', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('not-an-email')
  await page.getByLabel('Password', { exact: true }).fill('x')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible()
})

test('admin can sign in, sees the overview, and can log out', async ({ page }) => {
  await login(page)
  await expect(page.getByText('Open conversations')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL(/\/login/)
})

test('protected pages redirect anonymous visitors to login', async ({ page }) => {
  await page.goto('/inbox')
  await expect(page).toHaveURL(/\/login/)
})
