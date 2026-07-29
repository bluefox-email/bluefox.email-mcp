import { describe, expect, test } from 'vitest'
import { createEmailLifecycleTools } from './emailLifecycle.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveId, resolveIdOptional } = createResolveId(client)
  const tools = createEmailLifecycleTools({ client, resolveId, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('update_email', () => {
  test('updates a campaign by id with every campaign-only field', async () => {
    const { client, update_email: updateEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list123' }] }
      }
      if (path === '/segments') {
        return { items: [{ _id: 'seg123' }] }
      }
      return { items: [{ _id: 'sender123' }] }
    })
    client.patch.mockResolvedValue({ name: 'Summer Sale v2' })

    const result = await updateEmail.handler({
      type: 'campaign',
      emailId: 'campaign123',
      newName: 'Summer Sale v2',
      subject: 'New subject',
      body: 'New body',
      previewText: 'New preview',
      excludeUnengaged: true,
      senderIdentityEmail: 'hello@example.com',
      subscriberListName: 'Newsletter',
      segmentName: 'VIP',
      status: 'scheduled',
      scheduledFor: '2026-08-01T08:00:00.000Z'
    })

    expect(client.patch).toHaveBeenCalledWith('/campaigns/campaign123', {
      name: 'Summer Sale v2',
      subject: 'New subject',
      document: 'New body',
      previewText: 'New preview',
      excludeUnengaged: true,
      senderIdentity: 'sender123',
      subscriberListId: 'list123',
      segmentId: 'seg123',
      status: 'scheduled',
      scheduledTo: '2026-08-01T08:00:00.000Z'
    })
    expect(result.content[0].text).toBe('Updated campaign "Summer Sale v2".')
  })

  test('resolves a campaign by name when no id is given', async () => {
    const { client, update_email: updateEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'campaign123' }] })
    client.patch.mockResolvedValue({ name: 'Summer Sale' })

    await updateEmail.handler({ type: 'campaign', emailName: 'Summer Sale', subject: 'New subject' })

    expect(client.get).toHaveBeenCalledWith('/campaigns', { filter: { name: 'Summer Sale' }, limit: 2 })
    expect(client.patch).toHaveBeenCalledWith('/campaigns/campaign123', { subject: 'New subject' })
  })

  test('throws when neither id nor name is given', async () => {
    const { update_email: updateEmail } = setup()

    await expect(updateEmail.handler({ type: 'campaign' })).rejects.toThrow('Either an id or a name is required')
  })

  test('updates a triggered email, including its subscriber list, but not segment/status/scheduling', async () => {
    const { client, update_email: updateEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'list123' }] })
    client.patch.mockResolvedValue({ name: 'Welcome Email' })

    await updateEmail.handler({ type: 'triggered', emailId: 'trig123', subscriberListName: 'Newsletter' })

    expect(client.patch).toHaveBeenCalledWith('/triggered-emails/trig123', { subscriberListId: 'list123' })
  })

  test('updates a transactional email with only the fields common to all types', async () => {
    const { client, update_email: updateEmail } = setup()
    client.patch.mockResolvedValue({ name: 'Order Confirmation' })

    await updateEmail.handler({ type: 'transactional', emailId: 'email123', subject: 'New subject' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.patch).toHaveBeenCalledWith('/transactional-emails/email123', { subject: 'New subject' })
  })

  test('sends an empty patch body when no updatable fields are given', async () => {
    const { client, update_email: updateEmail } = setup()
    client.patch.mockResolvedValue({ name: 'Order Confirmation' })

    await updateEmail.handler({ type: 'transactional', emailId: 'email123' })

    expect(client.patch).toHaveBeenCalledWith('/transactional-emails/email123', {})
  })
})

describe('get_email', () => {
  test('lists every email of a type when none is specified', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockResolvedValue({ count: 2, items: [{ name: 'Summer Sale' }, { name: 'Winter Sale' }] })

    const result = await getEmail.handler({ type: 'campaign' })

    expect(client.get).toHaveBeenCalledWith('/campaigns', { limit: 30 })
    expect(result.content[0].text).toBe('2 campaign(s): Summer Sale, Winter Sale.')
  })

  test('reports when there are no emails of that type yet', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await getEmail.handler({ type: 'triggered' })
    expect(result.content[0].text).toBe('This project has no triggered emails yet.')
  })

  test('notes when more emails exist than were shown', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ name: 'Order Confirmation' }] })

    const result = await getEmail.handler({ type: 'transactional' })
    expect(result.content[0].text).toBe('5 transactional email(s): Order Confirmation (more not shown).')
  })

  test('returns detail and stats for a single email found by id', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/campaigns/campaign123') {
        return { name: 'Summer Sale', subject: 'Big discounts' }
      }
      return { sent: 100, opens: 40, uniqueOpens: 35, clicks: 10, uniqueClicks: 8, bounce: 2, complaint: 0 }
    })

    const result = await getEmail.handler({ type: 'campaign', emailId: 'campaign123' })

    expect(result.content[0].text).toBe(
      '"Summer Sale" - subject: "Big discounts". 100 sent, 40 opens (35 unique), 10 clicks (8 unique), 2 bounced, 0 complaints.'
    )
  })

  test('resolves by name when getting a single email', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/triggered-emails') {
        return { items: [{ _id: 'trig123' }] }
      }
      if (path === '/triggered-emails/trig123') {
        return { name: 'Welcome Email', subject: 'Welcome!' }
      }
      return { sent: 1, opens: 0, uniqueOpens: 0, clicks: 0, uniqueClicks: 0, bounce: 0, complaint: 0 }
    })

    await getEmail.handler({ type: 'triggered', emailName: 'Welcome Email' })
    expect(client.get).toHaveBeenCalledWith('/triggered-emails', { filter: { name: 'Welcome Email' }, limit: 2 })
  })
})

describe('get_email_recipients', () => {
  test('reports no matches', async () => {
    const { client, get_email_recipients: getEmailRecipients } = setup()
    client.get.mockResolvedValue({ items: [], count: 0 })

    const result = await getEmailRecipients.handler({ type: 'campaign', emailId: 'campaign123' })

    expect(client.get).toHaveBeenCalledWith('/campaigns/campaign123/recipients', { limit: undefined, skip: undefined, sort: undefined, order: undefined })
    expect(result.content[0].text).toBe('No recipients match.')
  })

  test('lists recipients with their engagement flags, and notes when more exist', async () => {
    const { client, get_email_recipients: getEmailRecipients } = setup()
    client.get.mockResolvedValue({
      count: 3,
      items: [
        { email: 'a@example.com', status: 'sent', opens: 2, clicks: 1, bounced: false, complained: false, unsubscribed: true, paused: false, subscribed: false, resubscribed: false },
        { email: 'b@example.com', status: 'failed', opens: 0, clicks: 0, bounced: false, complained: false, unsubscribed: false, paused: false, subscribed: false, resubscribed: false }
      ]
    })

    const result = await getEmailRecipients.handler({ type: 'campaign', emailId: 'campaign123', skip: 0 })

    expect(result.content[0].text).toBe(
      '3 recipient(s) total, showing 2 (1 more - pass skip=2 for the next page):\n' +
      'a@example.com - sent, 2 opens, 1 clicks (unsubscribed)\n' +
      'b@example.com - failed, 0 opens, 0 clicks'
    )
  })

  test('omits the "more" note when every matching recipient was shown', async () => {
    const { client, get_email_recipients: getEmailRecipients } = setup()
    client.get.mockResolvedValue({
      count: 1,
      items: [{ email: 'a@example.com', status: 'sent', opens: 0, clicks: 0, bounced: false, complained: false, unsubscribed: false, paused: false, subscribed: false, resubscribed: false }]
    })

    const result = await getEmailRecipients.handler({ type: 'transactional', emailId: 'email123' })

    expect(result.content[0].text).toBe('1 recipient(s) total, showing 1:\na@example.com - sent, 0 opens, 0 clicks')
  })

  test('resolves the email by name and builds a filter object from every given filter field', async () => {
    const { client, get_email_recipients: getEmailRecipients } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/triggered-emails') {
        return { items: [{ _id: 'trig123' }] }
      }
      return { items: [], count: 0 }
    })

    await getEmailRecipients.handler({
      type: 'triggered',
      emailName: 'Welcome Email',
      email: 'a@example.com',
      status: 'sent',
      opened: true,
      clicked: false,
      bounced: true,
      complained: false,
      unsubscribed: true,
      paused: false,
      subscribed: true,
      resubscribed: false,
      limit: 5,
      skip: 10,
      sort: 'email',
      order: 'asc'
    })

    expect(client.get).toHaveBeenCalledWith('/triggered-emails/trig123/recipients', {
      limit: 5,
      skip: 10,
      sort: 'email',
      order: 'asc',
      filter: {
        email: 'a@example.com',
        status: 'sent',
        opened: true,
        clicked: false,
        bounced: true,
        complained: false,
        unsubscribed: true,
        paused: false,
        subscribed: true,
        resubscribed: false
      }
    })
  })
})

describe('delete_email', () => {
  test('deletes a campaign by id', async () => {
    const { client, delete_email: deleteEmail } = setup()
    client.del.mockResolvedValue({})

    const result = await deleteEmail.handler({ type: 'campaign', emailId: 'campaign123' })

    expect(client.del).toHaveBeenCalledWith('/campaigns/campaign123')
    expect(result.content[0].text).toBe('Deleted the campaign.')
  })

  test('resolves a triggered email by name and deletes it', async () => {
    const { client, delete_email: deleteEmail } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'trig123' }] })
    client.del.mockResolvedValue({})

    const result = await deleteEmail.handler({ type: 'triggered', emailName: 'Welcome Email' })

    expect(client.del).toHaveBeenCalledWith('/triggered-emails/trig123')
    expect(result.content[0].text).toBe('Deleted the triggered email.')
  })
})
