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
    client.patch.mockResolvedValue({ _id: 'campaign123', name: 'Summer Sale v2', subject: 'New subject', status: 'scheduled', scheduledTo: '2026-08-01T08:00:00.000Z', timeZone: 'America/New_York' })

    const result = await updateEmail.handler({
      type: 'campaign',
      emailId: 'campaign123',
      newName: 'Summer Sale v2',
      subject: 'New subject',
      body: 'New body',
      bodyType: 'html',
      previewText: 'New preview',
      excludeUnengaged: true,
      senderIdentityEmail: 'hello@example.com',
      replyTo: 'support@example.com',
      feeds: [{ url: 'https://example.com/feed.xml', feedType: 'rss-xml', variableName: 'news' }],
      subscriberListName: 'Newsletter',
      segmentName: 'VIP',
      status: 'scheduled',
      scheduledFor: '2026-08-01T08:00:00.000Z',
      timeZone: 'America/New_York'
    })

    expect(client.patch).toHaveBeenCalledWith('/campaigns/campaign123', {
      name: 'Summer Sale v2',
      subject: 'New subject',
      document: 'New body',
      type: 'html',
      previewText: 'New preview',
      excludeUnengaged: true,
      replyTo: 'support@example.com',
      feeds: [{ url: 'https://example.com/feed.xml', feedType: 'rss-xml', variableName: 'news' }],
      senderIdentity: 'sender123',
      subscriberListId: 'list123',
      segmentId: 'seg123',
      status: 'scheduled',
      scheduledTo: '2026-08-01T08:00:00.000Z',
      timeZone: 'America/New_York'
    })
    expect(result.content[0].text).toContain('Updated campaign:')
    expect(result.content[0].text).toContain('"Summer Sale v2" (id campaign123)')
    expect(result.content[0].text).toContain('scheduled for 2026-08-01T08:00:00.000Z (time zone: America/New_York)')
  })

  test('does not send excludeUnengaged for a transactional email even if given', async () => {
    const { client, update_email: updateEmail } = setup()
    client.patch.mockResolvedValue({ name: 'Order Confirmation' })

    await updateEmail.handler({ type: 'transactional', emailId: 'email123', excludeUnengaged: true })

    expect(client.patch).toHaveBeenCalledWith('/transactional-emails/email123', {})
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

  test('returns full detail and stats for a single campaign found by id', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/campaigns/campaign123') {
        return {
          _id: 'campaign123',
          name: 'Summer Sale',
          subject: 'Big discounts',
          previewText: 'Save big',
          status: 'scheduled',
          scheduledTo: '2026-08-01T08:00:00.000Z',
          timeZone: 'UTC',
          subscriberListId: 'list123',
          segmentId: 'seg123',
          senderIdentity: 'sender123',
          replyTo: 'support@example.com',
          type: 'html',
          document: '<p>Big discounts this week!</p>',
          excludeUnengaged: true,
          feeds: [{ url: 'https://example.com/feed.xml', feedType: 'rss-xml', variableName: 'news', maxItems: 5, required: true, availableFields: ['title', 'link'] }]
        }
      }
      return { sent: 100, failed: 3, opens: 40, uniqueOpens: 35, clicks: 10, uniqueClicks: 8, bounce: 2, complaint: 0 }
    })

    const result = await getEmail.handler({ type: 'campaign', emailId: 'campaign123' })
    const text = result.content[0].text

    expect(text).toContain('"Summer Sale" (id campaign123)')
    expect(text).toContain('Preview text: "Save big"')
    expect(text).toContain('Content type: html')
    expect(text).toContain('Body:\n<p>Big discounts this week!</p>')
    expect(text).toContain('Status: scheduled, scheduled for 2026-08-01T08:00:00.000Z (time zone: UTC)')
    expect(text).toContain('Subscriber list id: list123')
    expect(text).toContain('Segment id: seg123')
    expect(text).toContain('Sender identity id: sender123')
    expect(text).toContain('Reply-to: support@example.com')
    expect(text).toContain('Exclude unengaged: yes')
    expect(text).toContain('- news: https://example.com/feed.xml (rss-xml), maxItems 5, required: yes, available fields: title, link')
    expect(text).toContain('Stats: 100 sent, 3 failed, 40 opens (35 unique), 10 clicks (8 unique), 2 bounced, 0 complaints.')
  })

  test('defaults the time zone to UTC when scheduled without one, and falls back to a "(no variableName)" placeholder and "unlimited"/"no" defaults on a bare feed', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/campaigns/campaign123') {
        return {
          _id: 'campaign123',
          name: 'Summer Sale',
          subject: 'Big discounts',
          status: 'scheduled',
          scheduledTo: '2026-08-01T08:00:00.000Z',
          feeds: [{ url: 'https://example.com/feed.xml', feedType: 'json' }]
        }
      }
      return { sent: 0, opens: 0, uniqueOpens: 0, clicks: 0, uniqueClicks: 0, bounce: 0, complaint: 0 }
    })

    const result = await getEmail.handler({ type: 'campaign', emailId: 'campaign123' })
    const text = result.content[0].text

    expect(text).toContain('(time zone: UTC)')
    expect(text).toContain('- (no variableName): https://example.com/feed.xml (json), maxItems unlimited, required: no')
  })

  test('returns minimal detail for a transactional email with no optional fields set, and no Body line when there is no document', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/transactional-emails/email123') {
        return { _id: 'email123', name: 'Order Confirmation', subject: 'Your order' }
      }
      return { sent: 0, opens: 0, uniqueOpens: 0, clicks: 0, uniqueClicks: 0, bounce: 0, complaint: 0 }
    })

    const result = await getEmail.handler({ type: 'transactional', emailId: 'email123' })
    const text = result.content[0].text

    expect(text).toContain('Content type: chamaileon (visual editor)')
    expect(text).not.toContain('Body:')
    expect(text).not.toContain('Exclude unengaged')
    expect(text).not.toContain('Status:')
    expect(text).toContain('Stats: 0 sent, 0 failed')
  })

  test('notes a visual-editor (Chamaileon) document instead of dumping raw JSON', async () => {
    const { client, get_email: getEmail } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/transactional-emails/email123') {
        return { _id: 'email123', name: 'Order Confirmation', subject: 'Your order', document: { body: { children: [] } } }
      }
      return { sent: 0, opens: 0, uniqueOpens: 0, clicks: 0, uniqueClicks: 0, bounce: 0, complaint: 0 }
    })

    const result = await getEmail.handler({ type: 'transactional', emailId: 'email123' })
    const text = result.content[0].text

    expect(text).toContain('Body: visual editor (Chamaileon) document - not shown as text, use the app to view/edit it.')
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

  test('includes sentAt and errors (string or object) when present', async () => {
    const { client, get_email_recipients: getEmailRecipients } = setup()
    client.get.mockResolvedValue({
      count: 2,
      items: [
        { email: 'a@example.com', status: 'failed', sentAt: '2026-08-01T10:00:00.000Z', opens: 0, clicks: 0, errors: ['SES rejected'] },
        { email: 'b@example.com', status: 'failed', opens: 0, clicks: 0, errors: [{ message: 'Timeout' }] }
      ]
    })

    const result = await getEmailRecipients.handler({ type: 'campaign', emailId: 'campaign123' })
    const text = result.content[0].text

    expect(text).toContain('a@example.com - failed at 2026-08-01T10:00:00.000Z, 0 opens, 0 clicks - errors: SES rejected')
    expect(text).toContain('b@example.com - failed, 0 opens, 0 clicks - errors: Timeout')
  })

  test('stringifies an error object with no message property', async () => {
    const { client, get_email_recipients: getEmailRecipients } = setup()
    client.get.mockResolvedValue({
      count: 1,
      items: [{ email: 'a@example.com', status: 'failed', opens: 0, clicks: 0, errors: [{ code: 'ETIMEDOUT' }] }]
    })

    const result = await getEmailRecipients.handler({ type: 'campaign', emailId: 'campaign123' })
    expect(result.content[0].text).toContain('errors: {"code":"ETIMEDOUT"}')
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

  test('deletes a transactional email by id', async () => {
    const { client, delete_email: deleteEmail } = setup()
    client.del.mockResolvedValue({})

    const result = await deleteEmail.handler({ type: 'transactional', emailId: 'email123' })

    expect(client.del).toHaveBeenCalledWith('/transactional-emails/email123')
    expect(result.content[0].text).toBe('Deleted the transactional email.')
  })
})

describe('list_email_error_log', () => {
  test('reports when there are no errors', async () => {
    const { client, list_email_error_log: listErrors } = setup()
    client.get.mockResolvedValue({ count: 0, items: [], unseenCount: 0 })

    const result = await listErrors.handler({ type: 'campaign', emailId: 'camp123' })

    expect(client.get).toHaveBeenCalledWith('/related-to/camp123/email-error-logs', { limit: undefined, skip: undefined })
    expect(result.content[0].text).toBe('No errors logged.')
  })

  test('formats processing and delivery errors with the unseen count and timestamp', async () => {
    const { client, list_email_error_log: listErrors } = setup()
    client.get.mockResolvedValue({
      count: 2,
      unseenCount: 1,
      items: [
        { createdAt: '2026-08-01T10:00:00.000Z', source: 'processing', recipient: null, errorName: 'TemplateError', errorMessage: 'bad merge tag' },
        { createdAt: '2026-08-01T11:00:00.000Z', source: 'delivery', recipient: 'a@example.com', errorName: 'Delivery Failure', errorMessage: 'SES: rejected' }
      ]
    })

    const result = await listErrors.handler({ type: 'campaign', emailId: 'camp123' })

    expect(result.content[0].text).toContain('2 error(s), 1 unseen:')
    expect(result.content[0].text).toContain('2026-08-01T10:00:00.000Z [processing] TemplateError: bad merge tag')
    expect(result.content[0].text).toContain('2026-08-01T11:00:00.000Z [delivery] a@example.com Delivery Failure: SES: rejected')
  })
})
