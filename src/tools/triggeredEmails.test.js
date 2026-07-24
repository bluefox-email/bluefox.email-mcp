import { describe, expect, test } from 'vitest'
import { createTriggeredEmailTools } from './triggeredEmails.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired, resolveIdOptional } = createResolveId(client)
  const tools = createTriggeredEmailTools({ client, resolveIdOrRequired, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('create_triggered_email', () => {
  test('creates a minimal triggered email using a subscriberListId directly', async () => {
    const { client, create_triggered_email: createTriggeredEmail } = setup()
    client.post.mockResolvedValue({ _id: 'trig123', name: 'Welcome Email' })

    const result = await createTriggeredEmail.handler({
      name: 'Welcome Email',
      subject: 'Welcome!',
      body: 'Hi there',
      subscriberListId: 'list123'
    })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/triggered-emails', {
      name: 'Welcome Email',
      subject: 'Welcome!',
      subscriberListId: 'list123',
      type: 'text',
      document: 'Hi there'
    })
    expect(result.content[0].text).toBe('Created triggered email "Welcome Email" (id trig123).')
  })

  test('creates with previewText, excludeUnengaged, and resolves list/sender by name', async () => {
    const { client, create_triggered_email: createTriggeredEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list123' }] }
      }
      return { items: [{ _id: 'sender123' }] }
    })
    client.post.mockResolvedValue({ _id: 'trig123', name: 'Welcome Email' })

    await createTriggeredEmail.handler({
      name: 'Welcome Email',
      subject: 'Welcome!',
      body: 'Hi there',
      bodyType: 'html',
      subscriberListName: 'Newsletter',
      previewText: 'Glad you joined',
      senderIdentityEmail: 'hello@example.com',
      excludeUnengaged: true
    })

    expect(client.post).toHaveBeenCalledWith('/triggered-emails', {
      name: 'Welcome Email',
      subject: 'Welcome!',
      subscriberListId: 'list123',
      type: 'html',
      document: 'Hi there',
      previewText: 'Glad you joined',
      senderIdentity: 'sender123',
      excludeUnengaged: true
    })
  })
})

describe('send_triggered_email', () => {
  test('sends to specific recipients, resolving the triggered email by name', async () => {
    const { client, send_triggered_email: sendTriggeredEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'trig123' }] })
    client.post.mockResolvedValue({ success: true })

    const result = await sendTriggeredEmail.handler({
      triggeredEmailName: 'Welcome Email',
      recipients: ['a@example.com', 'b@example.com'],
      data: { firstName: 'Ada' },
      attachments: [{ filename: 'welcome.pdf', content: 'base64==' }]
    })

    expect(client.post).toHaveBeenCalledWith('/send-triggered', {
      triggeredId: 'trig123',
      emails: ['a@example.com', 'b@example.com'],
      data: { firstName: 'Ada' },
      attachments: [{ filename: 'welcome.pdf', content: 'base64==' }]
    })
    expect(result.content[0].text).toBe('Sent the triggered email to 2 recipient(s).')
  })

  test('sends to the whole subscriber list when no recipients are given', async () => {
    const { client, send_triggered_email: sendTriggeredEmail } = setup()
    client.post.mockResolvedValue({ success: true })

    const result = await sendTriggeredEmail.handler({ triggeredEmailId: 'trig123' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/send-triggered', { triggeredId: 'trig123' })
    expect(result.content[0].text).toBe('Sent the triggered email to its subscriber list.')
  })
})
