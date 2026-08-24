import { describe, expect, test } from 'vitest'
import { createWebhookTools } from './webhook.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageWebhook] = createWebhookTools({ client })
  return { client, manageWebhook }
}

describe('manage_webhook', () => {
  test('get reports no webhook configured', async () => {
    const { client, manageWebhook } = setup()
    client.get.mockResolvedValue(null)

    const result = await manageWebhook.handler({ action: 'get' })

    expect(client.get).toHaveBeenCalledWith('/webhook')
    expect(result.content[0].text).toBe('This project has no webhook configured.')
  })

  test('get summarizes the configured webhook and its enabled events', async () => {
    const { client, manageWebhook } = setup()
    client.get.mockResolvedValue({ url: 'https://example.com/hook', bounce: true, click: true, complaint: false, open: false, sent: false, failed: false, subscription: false })

    const result = await manageWebhook.handler({ action: 'get' })
    expect(result.content[0].text).toBe('Webhook: https://example.com/hook - events: bounce, click.')
  })

  test('get reports no enabled events', async () => {
    const { client, manageWebhook } = setup()
    client.get.mockResolvedValue({ url: 'https://example.com/hook' })

    const result = await manageWebhook.handler({ action: 'get' })
    expect(result.content[0].text).toBe('Webhook: https://example.com/hook - events: none.')
  })

  test('set replaces the whole webhook configuration', async () => {
    const { client, manageWebhook } = setup()
    client.patch.mockResolvedValue({ url: 'https://example.com/hook', bounce: true, complaint: true, click: false, open: false, sent: false, failed: false, subscription: false })

    const result = await manageWebhook.handler({
      action: 'set',
      url: 'https://example.com/hook',
      secretKey: 'secret123',
      bounce: true,
      complaint: true,
      click: false,
      open: false,
      sent: false,
      failed: false,
      subscription: false
    })

    expect(client.patch).toHaveBeenCalledWith('/webhook', {
      url: 'https://example.com/hook',
      secretKey: 'secret123',
      bounce: true,
      complaint: true,
      click: false,
      open: false,
      sent: false,
      failed: false,
      subscription: false
    })
    expect(result.content[0].text).toBe('Set Webhook: https://example.com/hook - events: bounce, complaint.')
  })

  test('delete removes the webhook', async () => {
    const { client, manageWebhook } = setup()
    client.del.mockResolvedValue(null)

    const result = await manageWebhook.handler({ action: 'delete' })

    expect(client.del).toHaveBeenCalledWith('/webhook')
    expect(result.content[0].text).toBe('Removed the webhook.')
  })
})
