import { describe, expect, test } from 'vitest'
import { createTransactionalEmailTools } from './transactionalEmails.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired, resolveIdOptional } = createResolveId(client)
  const tools = createTransactionalEmailTools({ client, resolveIdOrRequired, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('create_transactional_email', () => {
  test('creates a minimal transactional email with no sender identity', async () => {
    const { client, create_transactional_email: createTransactionalEmail } = setup()
    client.post.mockResolvedValue({ _id: 'email123', name: 'Order Confirmation', subject: 'Your order' })

    const result = await createTransactionalEmail.handler({ name: 'Order Confirmation', subject: 'Your order', body: 'Thanks!' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/transactional-emails', {
      name: 'Order Confirmation',
      subject: 'Your order',
      type: 'text',
      document: 'Thanks!'
    })
    expect(result.content[0].text).toContain('Created transactional email:')
    expect(result.content[0].text).toContain('"Order Confirmation" (id email123)')
  })

  test('creates with previewText, replyTo, and a sender identity resolved by email', async () => {
    const { client, create_transactional_email: createTransactionalEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'sender123' }] })
    client.post.mockResolvedValue({ _id: 'email123', name: 'Order Confirmation' })

    await createTransactionalEmail.handler({
      name: 'Order Confirmation',
      subject: 'Your order',
      body: 'Thanks!',
      bodyType: 'html',
      previewText: 'Your order has shipped',
      senderIdentityEmail: 'orders@example.com',
      replyTo: 'support@example.com'
    })

    expect(client.post).toHaveBeenCalledWith('/transactional-emails', {
      name: 'Order Confirmation',
      subject: 'Your order',
      type: 'html',
      document: 'Thanks!',
      previewText: 'Your order has shipped',
      senderIdentity: 'sender123',
      replyTo: 'support@example.com'
    })
  })

  test('creates with a feed', async () => {
    const { client, create_transactional_email: createTransactionalEmail } = setup()
    client.post.mockResolvedValue({ _id: 'email123', name: 'Order Confirmation' })

    await createTransactionalEmail.handler({
      name: 'Order Confirmation',
      subject: 'Your order',
      body: 'Thanks!',
      feeds: [{ url: 'https://example.com/feed.json', feedType: 'json', variableName: 'related' }]
    })

    expect(client.post).toHaveBeenCalledWith('/transactional-emails', {
      name: 'Order Confirmation',
      subject: 'Your order',
      type: 'text',
      document: 'Thanks!',
      feeds: [{ url: 'https://example.com/feed.json', feedType: 'json', variableName: 'related' }]
    })
  })
})

describe('send_transactional_email', () => {
  test('resolves the email by name and sends with data + attachments', async () => {
    const { client, send_transactional_email: sendTransactionalEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'email123' }] })
    client.post.mockResolvedValue({ success: true })

    const result = await sendTransactionalEmail.handler({
      transactionalEmailName: 'Order Confirmation',
      to: 'buyer@example.com',
      data: { orderId: '123' },
      attachments: [{ filename: 'receipt.pdf', content: 'base64==' }]
    })

    expect(client.post).toHaveBeenCalledWith('/send-transactional', {
      email: 'buyer@example.com',
      transactionalId: 'email123',
      data: { orderId: '123' },
      attachments: [{ filename: 'receipt.pdf', content: 'base64==' }]
    })
    expect(result.content[0].text).toBe('Sent the transactional email to buyer@example.com.')
  })

  test('sends with just an id and no data/attachments', async () => {
    const { client, send_transactional_email: sendTransactionalEmail } = setup()
    client.post.mockResolvedValue({ success: true })

    await sendTransactionalEmail.handler({ transactionalEmailId: 'email123', to: 'buyer@example.com' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/send-transactional', {
      email: 'buyer@example.com',
      transactionalId: 'email123'
    })
  })
})
