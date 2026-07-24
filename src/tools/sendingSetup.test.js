import { describe, expect, test } from 'vitest'
import { createSendingSetupTools } from './sendingSetup.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageSendingSetup] = createSendingSetupTools({ client })
  return { client, manageSendingSetup }
}

describe('manage_sending_setup - domains', () => {
  test('list reports no domains yet', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'list' })
    expect(result.content[0].text).toBe('No domains have been added yet.')
  })

  test('list summarizes domains with DKIM status', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({
      count: 2,
      items: [
        { domain: 'example.com', region: 'us-east-1', observed: { dkim: { allOk: true } } },
        { domain: 'other.com', region: 'us-east-1', observed: { dkim: { allOk: false } } }
      ]
    })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'list' })
    expect(result.content[0].text).toBe(
      '2 domain(s): example.com (us-east-1) - DKIM verified; other.com (us-east-1) - DKIM not verified.'
    )
  })

  test('create adds a domain', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ _id: 'domain123', domain: 'example.com' })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'create', domain: 'example.com', region: 'us-east-1' })

    expect(client.post).toHaveBeenCalledWith('/domains', { domain: 'example.com', region: 'us-east-1' })
    expect(result.content[0].text).toContain('Added domain "example.com" (id domain123)')
  })

  test('check_dns reports verified', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ domain: 'example.com', observed: { dkim: { allOk: true } } })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domainId: 'domain123' })

    expect(client.post).toHaveBeenCalledWith('/domains/domain123/check')
    expect(result.content[0].text).toBe('Domain "example.com" DKIM is now verified.')
  })

  test('check_dns reports still not verified', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ domain: 'example.com', observed: { dkim: { allOk: false } } })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domainId: 'domain123' })
    expect(result.content[0].text).toBe('Domain "example.com" DKIM is still not verified.')
  })

  test('delete removes a domain by id', async () => {
    const { client, manageSendingSetup } = setup()
    client.del.mockResolvedValue({ _id: 'domain123' })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'delete', domainId: 'domain123' })

    expect(client.del).toHaveBeenCalledWith('/domains/domain123')
    expect(result.content[0].text).toBe('Deleted the domain.')
  })
})

describe('manage_sending_setup - sender identities', () => {
  test('list reports no sender identities yet', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'list' })
    expect(result.content[0].text).toBe('No sender identities have been added yet.')
  })

  test('list summarizes sender identities', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'hello@example.com', name: 'Support' }] })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'list' })
    expect(result.content[0].text).toBe('1 sender identit(y/ies): hello@example.com (Support).')
  })

  test('list summarizes a sender identity with no display name', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'hello@example.com' }] })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'list' })
    expect(result.content[0].text).toBe('1 sender identit(y/ies): hello@example.com.')
  })

  test('create adds a sender identity', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ _id: 'sender123', email: 'hello@example.com' })

    const result = await manageSendingSetup.handler({
      resource: 'sender_identity',
      action: 'create',
      email: 'hello@example.com',
      name: 'Support',
      region: 'us-east-1'
    })

    expect(client.post).toHaveBeenCalledWith('/sender-identities', { email: 'hello@example.com', name: 'Support', region: 'us-east-1' })
    expect(result.content[0].text).toBe('Added sender identity "hello@example.com" (id sender123).')
  })

  test('delete removes a sender identity by id', async () => {
    const { client, manageSendingSetup } = setup()
    client.del.mockResolvedValue({ _id: 'sender123' })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'delete', senderIdentityId: 'sender123' })

    expect(client.del).toHaveBeenCalledWith('/sender-identities/sender123')
    expect(result.content[0].text).toBe('Deleted the sender identity.')
  })
})
