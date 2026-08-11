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
  test('formats status with no request yet and no verified domain', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({ requestStatus: 'none', domainStatus: 'none', verifiedDomain: '', monthlyLimit: 0, limitIncreases: [] })

    const result = await getStatus.handler({})

    expect(client.get).toHaveBeenCalledWith('/production-access')
    expect(result.content[0].text).toBe('request: none, domain: none, monthly limit: 0.')
  })

  test('formats status with a verified domain and a pending limit increase', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({
      requestStatus: 'approved',
      domainStatus: 'verified',
      verifiedDomain: 'example.com',
      monthlyLimit: 5000,
      limitIncreases: [{ requestedLimit: 10000, status: 'pending' }]
    })

    const result = await getStatus.handler({})

    expect(result.content[0].text).toBe('request: approved, domain: verified (example.com), monthly limit: 5000, pending limit increase: 10000.')
  })

  test('does not mention a limit increase when none is pending', async () => {
    const { client, get_production_access_status: getStatus } = setup()
    client.get.mockResolvedValue({
      requestStatus: 'approved',
      domainStatus: 'verified',
      verifiedDomain: 'example.com',
      monthlyLimit: 5000,
      limitIncreases: [{ requestedLimit: 10000, status: 'approved' }]
    })

    const result = await getStatus.handler({})

    expect(result.content[0].text).toBe('request: approved, domain: verified (example.com), monthly limit: 5000.')
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
