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
    client.patch.mockResolvedValue({ name: 'Project', status: 'sandbox', awsConfig: { accessKeyIdHint: 'AKI...X' } })

    const result = await setConfig.handler({ accessKeyId: 'a', secretAccessKey: 'b', region: 'us-east-1' })

    expect(client.patch).toHaveBeenCalledWith('', { awsConfig: { accessKeyId: 'a', secretAccessKey: 'b', region: 'us-east-1' } })
    expect(result.content[0].text).toContain('status: sandbox')
    expect(result.content[0].text).toContain('AKI...X')
  })

  test('submits a per-identity region alongside name/email', async () => {
    const { client, set_byo_aws_config: setConfig } = setup()
    client.patch.mockResolvedValue({ name: 'Project', status: 'sandbox', awsConfig: {} })

    await setConfig.handler({ senderIdentities: [{ name: 'Support', email: 'support@example.com', region: 'us-east-1' }] })

    expect(client.patch).toHaveBeenCalledWith('', { awsConfig: { senderIdentities: [{ name: 'Support', email: 'support@example.com', region: 'us-east-1' }] } })
  })

  test('includes status: byoAwsSes when activating', async () => {
    const { client, set_byo_aws_config: setConfig } = setup()
    client.patch.mockResolvedValue({ name: 'Project', status: 'byoAwsSes', awsConfig: {} })

    await setConfig.handler({ roleArn: 'arn:x', activateByoAwsSes: true })

    expect(client.patch).toHaveBeenCalledWith('', { awsConfig: { roleArn: 'arn:x' }, status: 'byoAwsSes' })
  })

  test('reports region, limit, hints, and sender identities when present', async () => {
    const { client, set_byo_aws_config: setConfig } = setup()
    client.patch.mockResolvedValue({
      name: 'Project',
      status: 'byoAwsSes',
      awsConfig: {
        accessKeyIdHint: 'AKI...X',
        secretAccessKeyHint: 'SEC...Y',
        roleArnHint: 'arn...x',
        region: 'us-east-1',
        limit: 14,
        senderIdentities: [{ name: 'Support', email: 'support@example.com', region: 'us-east-1' }]
      }
    })

    const result = await setConfig.handler({ removeAwsConfig: 'accessKey' })
    const text = result.content[0].text

    expect(text).toContain('AKI...X')
    expect(text).toContain('SEC...Y')
    expect(text).toContain('arn...x')
    expect(text).toContain('Region: us-east-1')
    expect(text).toContain('Limit: 14 sends/sec')
    expect(text).toContain('Support <support@example.com> (us-east-1)')
  })
})

describe('get_aws_config', () => {
  test('reads back the currently configured AWS setup', async () => {
    const { client, get_aws_config: getAwsConfig } = setup()
    client.get.mockResolvedValue({
      name: 'Project',
      status: 'byoAwsSes',
      awsConfig: {
        accessKeyIdHint: 'AKI...X',
        region: 'us-east-1',
        limit: 14,
        senderIdentities: [{ name: 'Support', email: 'support@example.com' }]
      }
    })

    const result = await getAwsConfig.handler({})

    expect(client.get).toHaveBeenCalledWith('')
    expect(result.content[0].text).toContain('Region: us-east-1')
    expect(result.content[0].text).toContain('Support <support@example.com>')
  })

  test('reports none/no config when nothing is set yet, and offers both production access and BYO-AWS since the project is unrestricted', async () => {
    const { client, get_aws_config: getAwsConfig } = setup()
    client.get.mockResolvedValue({ name: 'Project', status: 'sandbox', restricted: false })

    const result = await getAwsConfig.handler({})
    const text = result.content[0].text

    expect(text).toContain('Access key: none')
    expect(text).toContain('Sender identities: none')
    expect(text).toContain('This project is not using BYO-AWS (status: sandbox)')
    expect(text).toContain('two independent options')
    expect(text).toContain('get_production_access_status / apply_for_production_access')
    expect(text).toContain('set_byo_aws_config')
  })

  test('when the project is restricted, only offers BYO-AWS since production access would not lift the restriction', async () => {
    const { client, get_aws_config: getAwsConfig } = setup()
    client.get.mockResolvedValue({ name: 'Project', status: 'sandbox', restricted: true, restrictedReason: 'Restricted automatically due to high bounce/complaint rates' })

    const result = await getAwsConfig.handler({})
    const text = result.content[0].text

    expect(text).toContain('This project is restricted (Restricted automatically due to high bounce/complaint rates)')
    expect(text).toContain('production access would not lift this')
    expect(text).toContain('set_byo_aws_config')
    expect(text).not.toContain('get_production_access_status / apply_for_production_access')
  })

  test('falls back to a generic reason when restricted but no reason is given', async () => {
    const { client, get_aws_config: getAwsConfig } = setup()
    client.get.mockResolvedValue({ name: 'Project', status: 'sandbox', restricted: true })

    const result = await getAwsConfig.handler({})

    expect(result.content[0].text).toContain('This project is restricted (reason not given)')
  })

  test('does not mention production access or restriction when the project is already byoAwsSes', async () => {
    const { client, get_aws_config: getAwsConfig } = setup()
    client.get.mockResolvedValue({ name: 'Project', status: 'byoAwsSes', restricted: true, awsConfig: { region: 'us-east-1' } })

    const result = await getAwsConfig.handler({})

    expect(result.content[0].text).not.toContain('not using BYO-AWS')
    expect(result.content[0].text).not.toContain('restricted')
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

  test('with no args and nothing stored, short-circuits with both options instead of a raw backend error', async () => {
    const { client, check_aws_credentials: check } = setup()
    client.get.mockResolvedValue({ status: 'sandbox', restricted: false })

    const result = await check.handler({})

    expect(client.get).toHaveBeenCalledWith('')
    expect(client.post).not.toHaveBeenCalled()
    expect(result.content[0].text).toBe(
      'There\'s no AWS config stored to check. This project is not using BYO-AWS (status: sandbox) - it sends through bluefox.email\'s shared infrastructure, not its own AWS account. An empty config here is expected and is not something to set up by default. It has two independent options: use get_production_access_status / apply_for_production_access to check or raise its limits on the shared infrastructure, or use set_byo_aws_config to send through its own AWS account instead.'
    )
  })

  test('with no args and nothing stored on a restricted project, short-circuits pointing only at BYO-AWS', async () => {
    const { client, check_aws_credentials: check } = setup()
    client.get.mockResolvedValue({ status: 'sandbox', restricted: true, restrictedReason: 'Restricted automatically due to high bounce/complaint rates' })

    const result = await check.handler({})

    expect(result.content[0].text).toContain('This project is restricted (Restricted automatically due to high bounce/complaint rates)')
    expect(result.content[0].text).not.toContain('get_production_access_status / apply_for_production_access')
  })

  test('with no args but a stored role ARN, checks it against SES as normal', async () => {
    const { client, check_aws_credentials: check } = setup()
    client.get.mockResolvedValue({ status: 'byoAwsSes', awsConfig: { roleArn: 'encrypted' } })
    client.post.mockResolvedValue({ success: true })

    const result = await check.handler({})

    expect(client.post).toHaveBeenCalledWith('/aws-check', {})
    expect(result.content[0].text).toBe('AWS credentials check passed.')
  })

  test('with no args but stored static keys, checks them against SES as normal', async () => {
    const { client, check_aws_credentials: check } = setup()
    client.get.mockResolvedValue({ status: 'byoAwsSes', awsConfig: { accessKeyId: 'encrypted' } })
    client.post.mockResolvedValue({ success: true })

    await check.handler({})

    expect(client.post).toHaveBeenCalledWith('/aws-check', {})
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
