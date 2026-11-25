import { expect, type Browser, type Page } from '@playwright/test'

export const ADMIN = { email: 'admin@voxera.dev', password: 'Voxera@123' }

export async function login(page: Page, creds = ADMIN) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(creds.email)
  await page.getByLabel('Password', { exact: true }).fill(creds.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText(/Good to see you/)).toBeVisible()
}

/** Customer chat in its own browser context (no staff session). */
export async function startCustomerChat(browser: Browser, email: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto('/chat/demo')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Start chat' }).click()
  await expect(page.getByText(/How can I help you today/)).toBeVisible()
  return { ctx, page }
}

export async function say(page: Page, text: string) {
  await page.getByLabel('Message').fill(text)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText(text, { exact: true })).toBeVisible()
}
