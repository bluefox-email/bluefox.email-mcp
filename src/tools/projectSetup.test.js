import { describe, expect, test, vi, beforeEach } from 'vitest'
import { createProjectSetupTools } from './projectSetup.js'
import { createFakeClient } from '../helpers/fakeClient.js'
import fs from 'fs/promises'

vi.mock('fs/promises', () => ({
  default: { writeFile: vi.fn().mockResolvedValue(undefined) }
}))

function setup () {
  const client = createFakeClient()
  const tools = createProjectSetupTools({ client })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, ...byName }
}

beforeEach(() => {
  fs.writeFile.mockClear()
})

describe('set_byo_aws_config', () => {
  test('submits only the given awsConfig fields', async () => {
    const { client, set_byo_aws_config: setConfig } = setup()
    client.patch.mockResolvedValue({ name: 'Project', status: 'sandbox', awsConfig: { accessKeyIdHint: 'AKI...X', roleArnHint: undefined } })

    const result = await setConfig.handler({ accessKeyId: 'a', secretAccessKey: 'b', region: 'us-east-1' })

    expect(client.patch).toHaveBeenCalledWith('', { awsConfig: { accessKeyId: 'a', secretAccessKey: 'b', region: 'us-east-1' } })
    expect(result.content[0].text).toContain('status: sandbox')
    expect(result.content[0].text).toContain('none')
  })

  test('includes status: byoAwsSes when activating', async () => {
    const { client, set_byo_aws_config: setConfig } = setup()
    client.patch.mockResolvedValue({ name: 'Project', status: 'byoAwsSes', awsConfig: {} })

    await setConfig.handler({ roleArn: 'arn:x', activateByoAwsSes: true })

    expect(client.patch).toHaveBeenCalledWith('', { awsConfig: { roleArn: 'arn:x' }, status: 'byoAwsSes' })
  })

  test('reports both hints when present', async () => {
    const { client, set_byo_aws_config: setConfig } = setup()
    client.patch.mockResolvedValue({ name: 'Project', status: 'byoAwsSes', awsConfig: { accessKeyIdHint: 'AKI...X', roleArnHint: 'arn...x' } })

    const result = await setConfig.handler({ removeAwsConfig: 'accessKey' })

    expect(result.content[0].text).toContain('AKI...X')
    expect(result.content[0].text).toContain('arn...x')
  })
})

describe('check_aws_credentials', () => {
  test('passes through the given args and reports success', async () => {
    const { client, check_aws_credentials: check } = setup()
    client.post.mockResolvedValue({ success: true })

    const result = await check.handler({ region: 'us-east-1' })

    expect(client.post).toHaveBeenCalledWith('/aws-check', { region: 'us-east-1' })
    expect(result.content[0].text).toBe('AWS credentials check passed.')
  })
})

describe('get_cloudformation_link', () => {
  test('returns the link', async () => {
    const { client, get_cloudformation_link: getLink } = setup()
    client.get.mockResolvedValue({ link: 'https://console.aws.amazon.com/...' })

    const result = await getLink.handler({})

    expect(client.get).toHaveBeenCalledWith('/cloudformation-link')
    expect(result.content[0].text).toBe('https://console.aws.amazon.com/...')
  })
})

describe('add_sandbox_test_email', () => {
  test('sends the verification request', async () => {
    const { client, add_sandbox_test_email: addEmail } = setup()
    client.post.mockResolvedValue({ success: true })

    const result = await addEmail.handler({ email: 'a@example.com' })

    expect(client.post).toHaveBeenCalledWith('/sandbox/emails', { email: 'a@example.com' })
    expect(result.content[0].text).toBe('Sent a verification email to a@example.com.')
  })
})

describe('remove_sandbox_test_email', () => {
  test('removes the email', async () => {
    const { client, remove_sandbox_test_email: removeEmail } = setup()
    client.del.mockResolvedValue({})

    const result = await removeEmail.handler({ email: 'a@example.com' })

    expect(client.del).toHaveBeenCalledWith('/sandbox/emails/a%40example.com')
    expect(result.content[0].text).toBe('Removed a@example.com from the sandbox verified emails.')
  })
})

describe('get_sandbox_deliverability', () => {
  test('formats sent count and rates', async () => {
    const { client, get_sandbox_deliverability: getStats } = setup()
    client.get.mockResolvedValue({ sentCount: 3, bounce: { rate: 1.5, pct: 10 }, complaint: { rate: 0, pct: 0 } })

    const result = await getStats.handler({})

    expect(client.get).toHaveBeenCalledWith('/sandbox/deliverability')
    expect(result.content[0].text).toBe('Sent today: 3. Bounce rate: 1.5% (10% of max). Complaint rate: 0% (0% of max).')
  })
})

describe('get_production_deliverability', () => {
  test('formats rates, monthly usage, and per-domain breakdown', async () => {
    const { client, get_production_deliverability: getStats } = setup()
    client.get.mockResolvedValue({
      bounce: { rate: 2, windowLabel: 'last 30 days' },
      complaint: { rate: 0.1, windowLabel: 'last 7 days' },
      monthly: { sent: 500, limit: 1000 },
      domains: [{ domain: 'example.com', sent: 500, bounces: 10, complaints: 1 }]
    })

    const result = await getStats.handler({})

    expect(result.content[0].text).toContain('example.com: 500 sent, 10 bounces, 1 complaints')
    expect(result.content[0].text).toContain('500/1000 sent')
  })

  test('reports "none" and "unlimited" when there are no domains or limit', async () => {
    const { client, get_production_deliverability: getStats } = setup()
    client.get.mockResolvedValue({
      bounce: { rate: 0, windowLabel: 'last 30 days' },
      complaint: { rate: 0, windowLabel: 'last 30 days' },
      monthly: { sent: 0, limit: 0 },
      domains: []
    })

    const result = await getStats.handler({})

    expect(result.content[0].text).toContain('Domains: none.')
    expect(result.content[0].text).toContain('0/unlimited sent')
  })
})

describe('test_webhook', () => {
  test('fires the given event type', async () => {
    const { client, test_webhook: testWebhook } = setup()
    client.get.mockResolvedValue({ success: true })

    const result = await testWebhook.handler({ type: 'open' })

    expect(client.get).toHaveBeenCalledWith('/test-webhook', { type: 'open' })
    expect(result.content[0].text).toBe('Test "open" event delivered successfully.')
  })
})

describe('export_domain_dns', () => {
  test('writes the CSV to a local file and reports the path', async () => {
    const { client, export_domain_dns: exportDns } = setup()
    client.getText.mockResolvedValue('type,name,value\nCNAME,a,b')

    const result = await exportDns.handler({ domainId: 'dom1' })

    expect(client.getText).toHaveBeenCalledWith('/domains/dom1/export/csv')
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('bluefox-domain-dns-dom1.csv'), 'type,name,value\nCNAME,a,b', 'utf8')
    expect(result.content[0].text).toContain('Saved DNS records to')
  })
})
