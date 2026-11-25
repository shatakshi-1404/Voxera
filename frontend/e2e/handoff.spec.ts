import { expect, test } from '@playwright/test'
import { login, say, startCustomerChat } from './helpers'

test('escalation appears live in the inbox and a human reply reaches the customer', async ({ browser, page }) => {
  await login(page)
  await page.goto('/inbox')

  const { ctx, page: customer } = await startCustomerChat(browser, 'rahul@example.com')
  await say(customer, 'I want to talk to a human')

  // realtime: no reload; the new escalated row arrives over the WebSocket
  const row = page.getByRole('link').filter({ hasText: 'Rahul Mehta' }).filter({ hasText: 'Escalated' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByText(/Escalated:/)).toBeVisible()

  await page.getByLabel('Message').fill('Hi Rahul, this is Aarav from support. How can I help?')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(customer.getByText('Hi Rahul, this is Aarav from support. How can I help?')).toBeVisible()

  // AI must stay silent while a human owns the conversation
  await say(customer, 'thanks, my order is late')
  await customer.waitForTimeout(2500)
  await expect(customer.getByText(/I'm Voxera|Could you share the email/)).toHaveCount(0)
  await ctx.close()
})

test('staff can leave an internal note that the customer never sees', async ({ browser, page }) => {
  const { ctx, page: customer } = await startCustomerChat(browser, 'priya@example.com')
  await say(customer, 'Hello')
  await login(page)
  await page.goto('/inbox')
  await page.getByRole('link').filter({ hasText: 'Priya Verma' }).first().click()
  await page.getByRole('button', { name: 'Internal note' }).click()
  await page.getByLabel('Message').fill('VIP customer, handle with care')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('VIP customer, handle with care')).toBeVisible()
  await expect(customer.getByText('VIP customer, handle with care')).toHaveCount(0)
  await ctx.close()
})
