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

  test('create adds a domain and surfaces the DNS records to set', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({
      _id: 'domain123',
      domain: 'example.com',
      requiredDns: {
        dkimCNAMEs: [{ type: 'CNAME', name: 'tok1._domainkey.example.com', value: 'tok1.dkim.amazonses.com' }],
        mx: { type: 'MX', name: 'example.com', value: 'feedback-smtp.us-east-1.amazonses.com', priority: '10' },
        spf: { type: 'TXT', name: 'example.com', value: 'v=spf1 include:amazonses.com ~all' },
        dmarc: { type: 'TXT', name: '_dmarc.example.com', value: 'v=DMARC1; p=none;' }
      }
    })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'create', domain: 'example.com', region: 'us-east-1' })

    expect(client.post).toHaveBeenCalledWith('/domains', { domain: 'example.com', region: 'us-east-1' })
    expect(result.content[0].text).toContain('Added domain "example.com" (id domain123)')
    expect(result.content[0].text).toContain('CNAME tok1._domainkey.example.com -> tok1.dkim.amazonses.com')
    expect(result.content[0].text).toContain('MX example.com -> feedback-smtp.us-east-1.amazonses.com (priority 10)')
    expect(result.content[0].text).toContain('TXT example.com -> v=spf1 include:amazonses.com ~all')
    expect(result.content[0].text).toContain('TXT _dmarc.example.com -> v=DMARC1; p=none;')
  })

  test('create adds a domain and formats non-DKIM records even when dkimCNAMEs is missing', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({
      _id: 'domain123',
      domain: 'example.com',
      requiredDns: { mx: { type: 'MX', name: 'example.com', value: 'feedback-smtp.us-east-1.amazonses.com', priority: '10' } }
    })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'create', domain: 'example.com', region: 'us-east-1' })
    expect(result.content[0].text).toContain('MX example.com -> feedback-smtp.us-east-1.amazonses.com (priority 10)')
  })

  test('create adds a domain even when the response has no requiredDns', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ _id: 'domain123', domain: 'example.com' })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'create', domain: 'example.com', region: 'us-east-1' })
    expect(result.content[0].text).toBe('Added domain "example.com" (id domain123). Add these DNS records, then use check_dns to verify:\n')
  })

  test('check_dns reports verified', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ domain: 'example.com', observed: { dkim: { allOk: true } } })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domainId: 'domain123' })

    expect(client.post).toHaveBeenCalledWith('/domains/domain123/check')
    expect(result.content[0].text).toBe('Domain "example.com" DKIM is now verified.')
  })

  test('check_dns reports still not verified, and re-surfaces the DNS records', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({
      domain: 'example.com',
      observed: { dkim: { allOk: false } },
      requiredDns: { dkimCNAMEs: [{ type: 'CNAME', name: 'tok1._domainkey.example.com', value: 'tok1.dkim.amazonses.com' }] }
    })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domainId: 'domain123' })
    expect(result.content[0].text).toContain('Domain "example.com" DKIM is still not verified.')
    expect(result.content[0].text).toContain('CNAME tok1._domainkey.example.com -> tok1.dkim.amazonses.com')
  })

  test('delete removes a domain by id', async () => {
    const { client, manageSendingSetup } = setup()
    client.del.mockResolvedValue({ _id: 'domain123' })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'delete', domainId: 'domain123' })

    expect(client.del).toHaveBeenCalledWith('/domains/domain123')
    expect(result.content[0].text).toBe('Deleted the domain.')
  })

  test('check_dns resolves the domain by name when no id is given, filtering server-side', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'domain123', domain: 'example.com', region: 'us-east-1' }] })
    client.post.mockResolvedValue({ domain: 'example.com', observed: { dkim: { allOk: true } } })

    const result = await manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domain: 'example.com' })

    expect(client.get).toHaveBeenCalledWith('/domains', { filter: { domain: 'example.com', region: undefined } })
    expect(client.post).toHaveBeenCalledWith('/domains/domain123/check')
    expect(result.content[0].text).toBe('Domain "example.com" DKIM is now verified.')
  })

  test('check_dns resolves the domain by name and region, passing both as a server-side filter', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'domain456', domain: 'example.com', region: 'eu-west-1' }] })
    client.post.mockResolvedValue({ domain: 'example.com', observed: { dkim: { allOk: true } } })

    await manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domain: 'example.com', region: 'eu-west-1' })

    expect(client.get).toHaveBeenCalledWith('/domains', { filter: { domain: 'example.com', region: 'eu-west-1' } })
    expect(client.post).toHaveBeenCalledWith('/domains/domain456/check')
  })

  test('delete resolves the domain by name', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'domain123', domain: 'example.com', region: 'us-east-1' }] })
    client.del.mockResolvedValue({ _id: 'domain123' })

    await manageSendingSetup.handler({ resource: 'domain', action: 'delete', domain: 'example.com' })

    expect(client.get).toHaveBeenCalledWith('/domains', { filter: { domain: 'example.com', region: undefined } })
    expect(client.del).toHaveBeenCalledWith('/domains/domain123')
  })

  test('rejects resolving a domain with neither domainId nor domain given', async () => {
    const { manageSendingSetup } = setup()

    await expect(manageSendingSetup.handler({ resource: 'domain', action: 'check_dns' }))
      .rejects.toThrow('Either domainId or domain is required.')
  })

  test('rejects when no domain matches the given name', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [] })

    await expect(manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domain: 'ghost.com' }))
      .rejects.toThrow('No domain "ghost.com" found.')
  })

  test('rejects when no domain matches the given name and region', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [] })

    await expect(manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domain: 'ghost.com', region: 'us-east-1' }))
      .rejects.toThrow('No domain "ghost.com" in region us-east-1 found.')
  })

  test('rejects when the domain name is ambiguous across regions', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({
      items: [
        { _id: 'domain123', domain: 'example.com', region: 'us-east-1' },
        { _id: 'domain456', domain: 'example.com', region: 'eu-west-1' }
      ]
    })

    await expect(manageSendingSetup.handler({ resource: 'domain', action: 'check_dns', domain: 'example.com' }))
      .rejects.toThrow('Multiple domains named "example.com" exist across regions')
  })
})

describe('manage_sending_setup - sender identities', () => {
  test('list reports no sender identities yet', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'list' })
    expect(result.content[0].text).toBe('No sender identities have been added yet.')
  })

  test('list summarizes sender identities, marking the first as default', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({
      count: 2,
      items: [{ email: 'hello@example.com', name: 'Support' }, { email: 'sales@example.com', name: 'Sales' }]
    })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'list' })
    expect(result.content[0].text).toContain('hello@example.com (Support) [default], sales@example.com (Sales).')
  })

  test('list summarizes a sender identity with no display name', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'hello@example.com' }] })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'list' })
    expect(result.content[0].text).toContain('1 sender identit(y/ies): hello@example.com [default].')
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

  test('set_default moves a sender identity to the front', async () => {
    const { client, manageSendingSetup } = setup()
    client.post.mockResolvedValue({ _id: 'sender123', email: 'hello@example.com' })

    const result = await manageSendingSetup.handler({ resource: 'sender_identity', action: 'set_default', senderIdentityId: 'sender123' })

    expect(client.post).toHaveBeenCalledWith('/sender-identities/sender123/set-default')
    expect(result.content[0].text).toBe('"hello@example.com" is now the default sender identity.')
  })

  test('set_default resolves the sender identity by email when no id is given, filtering server-side', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'sender123', email: 'hello@example.com' }] })
    client.post.mockResolvedValue({ _id: 'sender123', email: 'hello@example.com' })

    await manageSendingSetup.handler({ resource: 'sender_identity', action: 'set_default', senderIdentityEmail: 'hello@example.com' })

    expect(client.get).toHaveBeenCalledWith('/sender-identities', { filter: { email: 'hello@example.com' } })
    expect(client.post).toHaveBeenCalledWith('/sender-identities/sender123/set-default')
  })

  test('delete resolves the sender identity by email', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'sender123', email: 'hello@example.com' }] })
    client.del.mockResolvedValue({ _id: 'sender123' })

    await manageSendingSetup.handler({ resource: 'sender_identity', action: 'delete', senderIdentityEmail: 'hello@example.com' })

    expect(client.get).toHaveBeenCalledWith('/sender-identities', { filter: { email: 'hello@example.com' } })
    expect(client.del).toHaveBeenCalledWith('/sender-identities/sender123')
  })

  test('rejects resolving a sender identity with neither senderIdentityId nor senderIdentityEmail given', async () => {
    const { manageSendingSetup } = setup()

    await expect(manageSendingSetup.handler({ resource: 'sender_identity', action: 'set_default' }))
      .rejects.toThrow('Either senderIdentityId or senderIdentityEmail is required.')
  })

  test('rejects when no sender identity matches the given email', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [] })

    await expect(manageSendingSetup.handler({ resource: 'sender_identity', action: 'set_default', senderIdentityEmail: 'ghost@example.com' }))
      .rejects.toThrow('No sender identity with email "ghost@example.com" found.')
  })

  test('rejects when multiple sender identities share the given email', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'a', email: 'hello@example.com' }, { _id: 'b', email: 'hello@example.com' }] })

    await expect(manageSendingSetup.handler({ resource: 'sender_identity', action: 'set_default', senderIdentityEmail: 'hello@example.com' }))
      .rejects.toThrow('Multiple sender identities have email "hello@example.com"')
  })
})

describe('manage_sending_setup - regions', () => {
  test('list reports the available regions', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ regions: ['us-east-1', 'eu-west-1'] })

    const result = await manageSendingSetup.handler({ resource: 'region', action: 'list' })

    expect(client.get).toHaveBeenCalledWith('/regions')
    expect(result.content[0].text).toBe('Available sending regions: us-east-1, eu-west-1.')
  })

  test('list reports when no regions are configured', async () => {
    const { client, manageSendingSetup } = setup()
    client.get.mockResolvedValue({ regions: [] })

    const result = await manageSendingSetup.handler({ resource: 'region', action: 'list' })
    expect(result.content[0].text).toBe('No sending regions are configured for this project yet.')
  })

  test('rejects a non-list action', async () => {
    const { manageSendingSetup } = setup()

    const result = await manageSendingSetup.handler({ resource: 'region', action: 'create' })
    expect(result.content[0].text).toBe('Only the "list" action is supported for regions.')
  })
})
