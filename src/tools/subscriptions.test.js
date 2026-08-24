import { describe, expect, test } from 'vitest'
import { createSubscriptionTools } from './subscriptions.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired } = createResolveId(client)
  const tools = createSubscriptionTools({ client, resolveIdOrRequired })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('list_list_subscribers', () => {
  test('reports when the list has no subscribers', async () => {
    const { client, list_list_subscribers: listSubscribers } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await listSubscribers.handler({ subscriberListId: 'list123' })

    expect(client.get).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers', { limit: undefined, skip: undefined })
    expect(result.content[0].text).toBe('This list has no subscribers yet.')
  })

  test('summarizes subscribers with their status, including a paused-until date', async () => {
    const { client, list_list_subscribers: listSubscribers } = setup()
    client.get.mockResolvedValue({
      count: 2,
      items: [
        { email: 'alice@example.com', status: 'active' },
        { email: 'bob@example.com', status: 'paused', pausedUntil: '2026-09-01T00:00:00.000Z' }
      ]
    })

    const result = await listSubscribers.handler({ subscriberListId: 'list123' })
    expect(result.content[0].text).toBe('2 subscriber(s): alice@example.com (active), bob@example.com (paused until 2026-09-01).')
  })

  test('resolves the list by name and notes when more subscribers exist than were shown', async () => {
    const { client, list_list_subscribers: listSubscribers } = setup()
    client.get.mockResolvedValueOnce({ items: [{ _id: 'list123' }] }).mockResolvedValueOnce({ count: 5, items: [{ email: 'alice@example.com', status: 'active' }] })

    const result = await listSubscribers.handler({ subscriberListName: 'Newsletter', limit: 1 })

    expect(client.get).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers', { limit: 1, skip: undefined })
    expect(result.content[0].text).toBe('5 subscriber(s): alice@example.com (active) (more not shown).')
  })

  test('includes each subscriber\'s custom field values', async () => {
    const { client, list_list_subscribers: listSubscribers } = setup()
    client.get.mockResolvedValue({
      count: 1,
      items: [{ email: 'alice@example.com', status: 'active', customFields: { plan: 'pro', age: 32 } }]
    })

    const result = await listSubscribers.handler({ subscriberListId: 'list123' })

    expect(result.content[0].text).toBe('1 subscriber(s): alice@example.com (active) - custom fields: plan: pro, age: 32.')
  })
})

describe('get_list_subscriber', () => {
  test('reports a subscriber\'s status and tags', async () => {
    const { client, get_list_subscriber: getSubscriber } = setup()
    client.get.mockResolvedValue({ email: 'alice@example.com', status: 'unsubscribed', tags: ['vip'] })

    const result = await getSubscriber.handler({ subscriberListId: 'list123', email: 'alice@example.com' })

    expect(client.get).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers/alice%40example.com')
    expect(result.content[0].text).toBe('alice@example.com - status: unsubscribed - tags: vip')
  })

  test('reports a name and "none" for tags when there are none', async () => {
    const { client, get_list_subscriber: getSubscriber } = setup()
    client.get.mockResolvedValue({ email: 'alice@example.com', name: 'Alice', status: 'active' })

    const result = await getSubscriber.handler({ subscriberListId: 'list123', email: 'alice@example.com' })

    expect(result.content[0].text).toBe('alice@example.com (Alice) - status: active - tags: none')
  })

  test('includes the subscriber\'s custom field values', async () => {
    const { client, get_list_subscriber: getSubscriber } = setup()
    client.get.mockResolvedValue({ email: 'alice@example.com', status: 'active', customFields: { plan: 'pro' } })

    const result = await getSubscriber.handler({ subscriberListId: 'list123', email: 'alice@example.com' })

    expect(result.content[0].text).toBe('alice@example.com - status: active - tags: none - custom fields: plan: pro')
  })
})

describe('add_list_subscriber', () => {
  test('subscribes a contact with just an email', async () => {
    const { client, add_list_subscriber: addSubscriber } = setup()
    client.post.mockResolvedValue({ email: 'alice@example.com', status: 'active' })

    const result = await addSubscriber.handler({ subscriberListId: 'list123', email: 'alice@example.com' })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers', { email: 'alice@example.com' })
    expect(result.content[0].text).toBe('Subscribed alice@example.com to the list (status: active).')
  })

  test('subscribes a contact with name, tags, custom fields, and an explicit status to skip double opt-in', async () => {
    const { client, add_list_subscriber: addSubscriber } = setup()
    client.post.mockResolvedValue({ email: 'alice@example.com', status: 'active' })

    await addSubscriber.handler({
      subscriberListId: 'list123',
      email: 'alice@example.com',
      name: 'Alice',
      tags: ['vip'],
      status: 'active',
      customFields: { plan: 'pro' }
    })

    expect(client.post).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers', {
      email: 'alice@example.com',
      plan: 'pro',
      name: 'Alice',
      tags: ['vip'],
      status: 'active'
    })
  })
})

describe('update_list_subscriber', () => {
  test('updates a subscriber\'s status', async () => {
    const { client, update_list_subscriber: updateSubscriber } = setup()
    client.patch.mockResolvedValue({ email: 'alice@example.com', status: 'unsubscribed' })

    const result = await updateSubscriber.handler({ subscriberListId: 'list123', email: 'alice@example.com', status: 'unsubscribed' })

    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers/alice%40example.com', { status: 'unsubscribed' })
    expect(result.content[0].text).toBe('Updated alice@example.com on the list (status: unsubscribed).')
  })

  test('updates email, name, tags, custom fields, and pausedUntil together', async () => {
    const { client, update_list_subscriber: updateSubscriber } = setup()
    client.patch.mockResolvedValue({ email: 'new@example.com', status: 'paused' })

    await updateSubscriber.handler({
      subscriberListId: 'list123',
      email: 'alice@example.com',
      newEmail: 'new@example.com',
      name: 'Alice',
      tags: ['vip'],
      status: 'paused',
      pausedUntil: '2026-09-01',
      customFields: { plan: 'pro' }
    })

    expect(client.patch).toHaveBeenCalledWith('/subscriber-lists/list123/subscribers/alice%40example.com', {
      plan: 'pro',
      email: 'new@example.com',
      name: 'Alice',
      tags: ['vip'],
      status: 'paused',
      pausedUntil: '2026-09-01'
    })
  })
})
