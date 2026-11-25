import { expect, test } from '@playwright/test'
import { login, say, startCustomerChat } from './helpers'

// The MVP milestone from the plan: customer chat -> verified identity -> order lookup -> ticket -> visible to staff.
test('delayed-order journey: verify, explain delay, create ticket, staff sees it', async ({ browser, page }) => {
  const { ctx, page: customer } = await startCustomerChat(browser, 'ananya@example.com')
  await say(customer, "My order hasn't arrived. Can you check?")
  await expect(customer.getByText(/last 4|four digits|4 digits/i)).toBeVisible()
  await say(customer, '4821')
  await expect(customer.getByText(/delay/i).first()).toBeVisible()
  await say(customer, 'yes please')
  await expect(customer.getByText(/T-[0-9A-F]{6}/)).toBeVisible()

  await login(page)
  await page.goto('/inbox')
  const row = page.getByRole('link').filter({ hasText: 'Ananya Sharma' }).first()
  await expect(row).toBeVisible()
  await row.click()
  await expect(page.getByText('Verified', { exact: true })).toBeVisible()
  await expect(page.getByText('Voxera AI').first()).toBeVisible()

  await page.goto('/tickets')
  await expect(page.getByText(/Delayed order VX-10284/).first()).toBeVisible()
  await ctx.close()
})

test('wrong identity answer does not reveal order data', async ({ browser }) => {
  const { ctx, page: customer } = await startCustomerChat(browser, 'priya@example.com')
  await say(customer, 'Where is my order?')
  await say(customer, '0000')
  await expect(customer.getByText(/VX-10310|Desk Lamp/)).toHaveCount(0)
  await ctx.close()
})
