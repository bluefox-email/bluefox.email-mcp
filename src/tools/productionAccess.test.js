import { describe, expect, test } from 'vitest'
import { createProductionAccessTools } from './productionAccess.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const tools = createProductionAccessTools({ client })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

describe('apply_for_production_access', () => {
  test('submits a production access request', async () => {
    const { client, apply_for_production_access: apply } = setup()
    client.post.mockResolvedValue({ status: 'pending' })

    const args = {
      volume: 1000,
      whyBluefox: 'good pricing',
      typeOfEmails: 'newsletters',
      contactsSource: 'signup form',
      productDescription: 'a newsletter product',
      website: 'https://example.com'
    }
    const result = await apply.handler(args)

    expect(client.post).toHaveBeenCalledWith('/production-access', args)
    expect(result.content[0].text).toBe('Production access request submitted (status: pending).')
  })
})

describe('get_production_access_status', () => {
  test('formats status with no request yet, no verified domain, no sending rates, and no limit increase history', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({ requestStatus: 'none', domainStatus: 'none', verifiedDomain: '', monthlyLimit: 0, sendingRates: [], limitIncreases: [] })

    const result = await getStatus.handler({})

    expect(client.get).toHaveBeenCalledWith('/production-access')
    expect(result.content[0].text).toBe('request: none, domain: none, monthly limit: 0, sending rates: none configured.\nLimit increase history:\nnone requested yet')
  })

  test('formats status with a verified domain, sending rates, and a pending limit increase', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({
      requestStatus: 'approved',
      domainStatus: 'verified',
      verifiedDomain: 'example.com',
      monthlyLimit: 5000,
      sendingRates: [{ region: 'us-east-1', ratePerSecond: 14 }],
      limitIncreases: [{ requestedLimit: 10000, reason: 'growing fast', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z' }]
    })

    const result = await getStatus.handler({})

    expect(result.content[0].text).toContain('request: approved, domain: verified (example.com), monthly limit: 5000, sending rates: us-east-1: 14/s.')
    expect(result.content[0].text).toContain('2026-01-01T00:00:00.000Z: requested 10000 (pending) - growing fast')
  })

  test('shows multiple sending rates and the full limit increase history including approved/declined entries', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({
      requestStatus: 'approved',
      domainStatus: 'verified',
      verifiedDomain: 'example.com',
      monthlyLimit: 20000,
      sendingRates: [{ region: 'us-east-1', ratePerSecond: 14 }, { region: 'eu-west-1', ratePerSecond: 9 }],
      limitIncreases: [
        { requestedLimit: 10000, approvedLimit: 10000, reason: 'growing fast', status: 'approved', createdAt: '2026-01-01T00:00:00.000Z' },
        { requestedLimit: 50000, reason: 'too much, too soon', status: 'declined', createdAt: '2026-02-01T00:00:00.000Z' }
      ]
    })

    const result = await getStatus.handler({})

    expect(result.content[0].text).toContain('sending rates: us-east-1: 14/s, eu-west-1: 9/s.')
    expect(result.content[0].text).toContain('2026-01-01T00:00:00.000Z: requested 10000 (approved, approved limit 10000) - growing fast')
    expect(result.content[0].text).toContain('2026-02-01T00:00:00.000Z: requested 50000 (declined) - too much, too soon')
  })

  test('falls back to "unknown date" when a limit increase entry has no createdAt', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({
      requestStatus: 'approved',
      domainStatus: 'verified',
      monthlyLimit: 5000,
      limitIncreases: [{ requestedLimit: 10000, reason: 'growing fast', status: 'pending' }]
    })

    const result = await getStatus.handler({})
    expect(result.content[0].text).toContain('unknown date: requested 10000 (pending) - growing fast')
  })

  test('notes when the project is restricted, since approval does not lift it', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({
      requestStatus: 'approved',
      domainStatus: 'verified',
      monthlyLimit: 5000,
      limitIncreases: [],
      restricted: true,
      restrictedReason: 'Restricted automatically due to high bounce/complaint rates'
    })

    const result = await getStatus.handler({})
    expect(result.content[0].text).toContain('Restricted (Restricted automatically due to high bounce/complaint rates) - this blocks sending on the shared infrastructure regardless of production-access status')
  })

  test('falls back to a generic reason when restricted but no reason is given', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({ requestStatus: 'approved', domainStatus: 'verified', monthlyLimit: 5000, limitIncreases: [], restricted: true })

    const result = await getStatus.handler({})
    expect(result.content[0].text).toContain('Restricted (reason not given)')
  })
})

describe('request_limit_increase', () => {
  test('requests a limit increase', async () => {
    const { client, request_limit_increase: requestIncrease } = setup()
    client.post.mockResolvedValue({ limitIncreases: [{ requestedLimit: 10000, status: 'pending' }] })

    const result = await requestIncrease.handler({ monthlyLimit: 10000, reason: 'growing fast this quarter' })

    expect(client.post).toHaveBeenCalledWith('/production-access/limit-increase', { monthlyLimit: 10000, reason: 'growing fast this quarter' })
    expect(result.content[0].text).toBe('Requested a limit increase to 10000 (status: pending).')
  })
})
