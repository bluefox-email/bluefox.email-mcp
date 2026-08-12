import { describe, expect, test } from 'vitest'
import { createCampaignTools } from './campaigns.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired, resolveIdOptional } = createResolveId(client)
  const [createCampaign] = createCampaignTools({ client, resolveIdOrRequired, resolveIdOptional })
  return { client, createCampaign }
}

describe('create_campaign', () => {
  test('creates a minimal draft campaign using a subscriberListId directly', async () => {
    const { client, createCampaign } = setup()
    client.post.mockResolvedValue({ _id: 'campaign123', name: 'Summer Sale' })

    const result = await createCampaign.handler({
      name: 'Summer Sale',
      subject: 'Big discounts',
      body: 'Hello',
      subscriberListId: 'list123'
    })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.post).toHaveBeenCalledWith('/campaigns', {
      name: 'Summer Sale',
      subject: 'Big discounts',
      timeZone: 'UTC',
      subscriberListId: 'list123',
      type: 'text',
      document: 'Hello'
    })
    expect(result.content[0].text).toBe('Created campaign "Summer Sale" (id campaign123) as a draft.')
  })

  test('creates and schedules a campaign, resolving list/segment by name', async () => {
    const { client, createCampaign } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list123' }] }
      }
      return { items: [{ _id: 'seg123' }] }
    })
    client.post.mockResolvedValue({ _id: 'campaign123', name: 'Summer Sale' })

    const result = await createCampaign.handler({
      name: 'Summer Sale',
      subject: 'Big discounts',
      body: 'Hello',
      bodyType: 'html',
      subscriberListName: 'Newsletter',
      segmentName: 'VIP',
      previewText: 'Save big',
      replyTo: 'support@example.com',
      excludeUnengaged: true,
      scheduledFor: '2026-08-01T08:00:00.000Z',
      timeZone: 'America/New_York'
    })

    expect(client.post).toHaveBeenCalledWith('/campaigns', {
      name: 'Summer Sale',
      subject: 'Big discounts',
      timeZone: 'America/New_York',
      subscriberListId: 'list123',
      type: 'html',
      document: 'Hello',
      segmentId: 'seg123',
      previewText: 'Save big',
      replyTo: 'support@example.com',
      excludeUnengaged: true,
      status: 'scheduled',
      scheduledTo: '2026-08-01T08:00:00.000Z'
    })
    expect(result.content[0].text).toBe('Created campaign "Summer Sale" (id campaign123) and scheduled for 2026-08-01T08:00:00.000Z.')
  })

  test('creates with a sender identity resolved by email and a feed', async () => {
    const { client, createCampaign } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'sender123' }] })
    client.post.mockResolvedValue({ _id: 'campaign123', name: 'Summer Sale' })

    await createCampaign.handler({
      name: 'Summer Sale',
      subject: 'Big discounts',
      body: 'Hello',
      subscriberListId: 'list123',
      senderIdentityEmail: 'promo@example.com',
      feeds: [{ url: 'https://example.com/feed.xml', feedType: 'rss-xml', variableName: 'news' }]
    })

    expect(client.post).toHaveBeenCalledWith('/campaigns', {
      name: 'Summer Sale',
      subject: 'Big discounts',
      timeZone: 'UTC',
      subscriberListId: 'list123',
      type: 'text',
      document: 'Hello',
      senderIdentity: 'sender123',
      feeds: [{ url: 'https://example.com/feed.xml', feedType: 'rss-xml', variableName: 'news' }]
    })
  })
})
