import { describe, expect, test } from 'vitest'
import { createTestEmailTools } from './testEmail.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired, resolveIdOptional } = createResolveId(client)
  const [sendTestEmail] = createTestEmailTools({ client, resolveIdOrRequired, resolveIdOptional })
  return { client, sendTestEmail }
}

describe('send_test_email', () => {
  test('sends to a specific address, resolving the campaign by name', async () => {
    const { client, sendTestEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'campaign123' }] })
    client.post.mockResolvedValue({ success: true })

    const result = await sendTestEmail.handler({
      type: 'campaign',
      emailName: 'Summer Sale',
      to: 'me@example.com',
      data: { firstName: 'Ada' }
    })

    expect(client.get).toHaveBeenCalledWith('/campaigns', { filter: { name: 'Summer Sale' }, limit: 2 })
    expect(client.post).toHaveBeenCalledWith('/test-email/campaign123', {
      type: 'campaign',
      email: 'me@example.com',
      data: { firstName: 'Ada' }
    })
    expect(result.content[0].text).toBe('Sent a test campaign to me@example.com.')
  })

  test('sends to a private subscriber list, resolving both the email and the list by name', async () => {
    const { client, sendTestEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/triggered-emails') {
        return { items: [{ _id: 'trig123' }] }
      }
      return { items: [{ _id: 'list123' }] }
    })
    client.post.mockResolvedValue({ success: true })

    const result = await sendTestEmail.handler({
      type: 'triggered',
      emailId: 'trig123',
      subscriberListName: 'Internal testers'
    })

    expect(client.post).toHaveBeenCalledWith('/test-email/trig123', {
      type: 'triggered',
      subscriberListId: 'list123'
    })
    expect(result.content[0].text).toBe('Sent a test triggered email to the subscriber list.')
  })

  test('sends with just an emailId and subscriberListId, no lookups needed', async () => {
    const { client, sendTestEmail } = setup()
    client.post.mockResolvedValue({ success: true })

    await sendTestEmail.handler({ type: 'transactional', emailId: 'email123', subscriberListId: 'list123' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/test-email/email123', {
      type: 'transactional',
      subscriberListId: 'list123'
    })
  })

  test('throws when neither a recipient email nor a subscriber list is given', async () => {
    const { sendTestEmail } = setup()

    await expect(sendTestEmail.handler({ type: 'campaign', emailId: 'campaign123' }))
      .rejects.toThrow('Please specify a recipient by email (to) or by subscriber list.')
  })
})
