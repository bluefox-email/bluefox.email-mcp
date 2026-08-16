import { describe, expect, test } from 'vitest'
import { createAutomationTools } from './automations.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired, resolveIdOptional } = createResolveId(client)
  const tools = createAutomationTools({ client, resolveIdOrRequired, resolveIdOptional })
  const byName = Object.fromEntries(tools.map(tool => [tool.name, tool]))
  return { client, tools, byName }
}

const baseAutomation = {
  _id: 'auto1',
  name: 'Welcome flow',
  status: 'draft',
  trigger: { type: 'contact-added', subscriberListId: 'list1' },
  exitCriteria: { active: false },
  sequence: []
}

describe('manage_automation', () => {
  test('list reports no automations yet', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await byName.manage_automation.handler({ action: 'list' })
    expect(result.content[0].text).toBe('No automations are defined yet.')
    expect(client.get).toHaveBeenCalledWith('/automations', { limit: 30 })
  })

  test('list summarizes automations and notes when more exist', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ name: 'Welcome flow', _id: 'auto1', status: 'active' }] })

    const result = await byName.manage_automation.handler({ action: 'list' })
    expect(result.content[0].text).toContain('5 automation(s):')
    expect(result.content[0].text).toContain('"Welcome flow" (id auto1) - active')
    expect(result.content[0].text).toContain('(more not shown)')
  })

  test('list omits the "more not shown" note when every automation was returned', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ name: 'Welcome flow', _id: 'auto1', status: 'active' }] })

    const result = await byName.manage_automation.handler({ action: 'list' })
    expect(result.content[0].text).not.toContain('more not shown')
  })

  test('create without basedOn just posts the name', async () => {
    const { client, byName } = setup()
    client.post.mockResolvedValue(baseAutomation)

    const result = await byName.manage_automation.handler({ action: 'create', name: 'Welcome flow' })

    expect(client.post).toHaveBeenCalledWith('/automations', { name: 'Welcome flow' })
    expect(result.content[0].text).toContain('Created automation:')
  })

  test('create with basedOnName resolves the source and duplicates without a list override', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValueOnce({ items: [{ _id: 'source1' }] })
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation.handler({ action: 'create', name: 'Clone', basedOnName: 'Welcome flow' })

    expect(client.post).toHaveBeenCalledWith('/automations', { name: 'Clone', basedOn: 'source1' })
  })

  test('create with basedOnId and a subscriberListId override includes both', async () => {
    const { client, byName } = setup()
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation.handler({ action: 'create', name: 'Clone', basedOnId: 'source1', subscriberListId: 'list2' })

    expect(client.post).toHaveBeenCalledWith('/automations', { name: 'Clone', basedOn: 'source1', subscriberListId: 'list2' })
  })

  test('get resolves by name and shows full detail', async () => {
    const { client, byName } = setup()
    client.get.mockImplementation(async path => (path === '/automations' ? { items: [{ _id: 'auto1' }] } : baseAutomation))

    const result = await byName.manage_automation.handler({ action: 'get', automationName: 'Welcome flow' })
    expect(result.content[0].text).toContain('"Welcome flow" (id auto1)')
  })

  test('update_name renames by id', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ ...baseAutomation, name: 'Renamed' })

    const result = await byName.manage_automation.handler({ action: 'update_name', automationId: 'auto1', name: 'Renamed' })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1', { name: 'Renamed' })
    expect(result.content[0].text).toContain('Renamed automation:')
  })

  test('delete without confirm previews and does not call the API', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue(baseAutomation)

    const result = await byName.manage_automation.handler({ action: 'delete', automationId: 'auto1' })

    expect(client.del).not.toHaveBeenCalled()
    expect(result.content[0].text).toContain('requires confirmation')
    expect(result.content[0].text).toContain('"Welcome flow"')
  })

  test('delete with confirm true actually deletes', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue(baseAutomation)
    client.del.mockResolvedValue({})

    const result = await byName.manage_automation.handler({ action: 'delete', automationId: 'auto1', confirm: true })

    expect(client.del).toHaveBeenCalledWith('/automations/auto1')
    expect(result.content[0].text).toBe('Deleted the automation.')
  })
})

describe('manage_automation_trigger', () => {
  test('get shows the current trigger', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue(baseAutomation)

    const result = await byName.manage_automation_trigger.handler({ action: 'get', automationId: 'auto1' })
    expect(result.content[0].text).toBe('When a contact is added to list list1.')
  })

  test('set applies directly on a draft automation and resolves list/segment names', async () => {
    const { client, byName } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/subscriber-lists') {
        return { items: [{ _id: 'list1' }] }
      }
      if (path === '/segments') {
        return { items: [{ _id: 'seg1' }] }
      }
      return {}
    })
    client.patch.mockResolvedValue({ trigger: { type: 'enter-segment', subscriberListId: 'list1', segmentId: 'seg1' } })

    const result = await byName.manage_automation_trigger.handler({
      action: 'set',
      automationId: 'auto1',
      type: 'enter-segment',
      subscriberListName: 'Newsletter',
      segmentName: 'VIP'
    })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/trigger', { type: 'enter-segment', subscriberListId: 'list1', segmentId: 'seg1' })
    expect(result.content[0].text).not.toContain('staged')
  })

  test('set on a contact-updated trigger includes property and from/to', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ trigger: { type: 'contact-updated' } })

    await byName.manage_automation_trigger.handler({
      action: 'set',
      automationId: 'auto1',
      type: 'contact-updated',
      property: 'plan',
      fromOperator: 'equals',
      fromValue: 'free',
      toOperator: 'equals',
      toValue: 'pro'
    })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/trigger', {
      type: 'contact-updated',
      property: 'plan',
      from: { operator: 'equals', value: 'free' },
      to: { operator: 'equals', value: 'pro' }
    })
  })

  test('set on a time-based trigger includes schedule/time/dayOf/nthOf, and reports staging when the result carries a draftTrigger', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ trigger: { type: 'contact-added' }, draftTrigger: { type: 'time-based', schedule: 'weekly', dayOf: 'monday', time: '10:00' } })

    const result = await byName.manage_automation_trigger.handler({
      action: 'set',
      automationId: 'auto1',
      type: 'time-based',
      schedule: 'weekly',
      time: '10:00',
      dayOf: 'monday',
      nthOf: 2
    })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/trigger', { type: 'time-based', schedule: 'weekly', time: '10:00', dayOf: 'monday', nthOf: 2 })
    expect(result.content[0].text).toContain('staged as a draft change')
  })
})

describe('manage_automation_exit_criteria', () => {
  test('get shows the current exit criteria', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue(baseAutomation)

    const result = await byName.manage_automation_exit_criteria.handler({ action: 'get', automationId: 'auto1' })
    expect(result.content[0].text).toContain('No exit criteria')
  })

  test('clear applies directly when the result has no draftExitCriteria', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ exitCriteria: { active: false } })

    const result = await byName.manage_automation_exit_criteria.handler({ action: 'clear', automationId: 'auto1' })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/exit-criteria', { active: false })
    expect(result.content[0].text).toBe('Cleared the exit criteria.')
  })

  test('clear reports staging when the result carries a draftExitCriteria', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ draftExitCriteria: { active: false } })

    const result = await byName.manage_automation_exit_criteria.handler({ action: 'clear', automationId: 'auto1' })
    expect(result.content[0].text).toBe('Staged clearing the exit criteria (not live until merged).')
  })

  test('set resolves a segment name and reports the applied criteria', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'seg1' }] })
    client.patch.mockResolvedValue({ exitCriteria: { active: true, segmentId: 'seg1' } })

    const result = await byName.manage_automation_exit_criteria.handler({ action: 'set', automationId: 'auto1', segmentName: 'Unengaged' })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/exit-criteria', { active: true, segmentId: 'seg1' })
    expect(result.content[0].text).toContain('Set exit criteria:')
  })

  test('set reports staging when the result carries a draftExitCriteria', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ exitCriteria: { active: false }, draftExitCriteria: { active: true, excludeUnengaged: true } })

    const result = await byName.manage_automation_exit_criteria.handler({ action: 'set', automationId: 'auto1', excludeUnengaged: true })

    expect(result.content[0].text).toContain('staged as a draft change')
  })
})

describe('manage_automation_node', () => {
  test('add posts the node without a prevNodeId', async () => {
    const { client, byName } = setup()
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'add', automationId: 'auto1', nodeType: 'complete' })

    expect(client.post).toHaveBeenCalledWith('/automations/auto1/node', { type: 'complete' })
  })

  test('add with a prevNodeId and delay fields', async () => {
    const { client, byName } = setup()
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'add', automationId: 'auto1', nodeType: 'delay', prevNodeId: 'n1', duration: 2, durationType: 'day' })

    expect(client.post).toHaveBeenCalledWith('/automations/auto1/node', { type: 'delay', duration: 2, durationType: 'day', prevNodeId: 'n1' })
  })

  test('add a filter-audience node, resolving a segment name', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'seg1' }] })
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'add', automationId: 'auto1', nodeType: 'filter-audience', segmentName: 'VIP', operator: 'any' })

    expect(client.post).toHaveBeenCalledWith('/automations/auto1/node', { type: 'filter-audience', operator: 'any', segmentId: 'seg1' })
  })

  test('add a notify node, resolving a subscriber list name', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'list1' }] })
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'add', automationId: 'auto1', nodeType: 'notify', subscriberListName: 'Newsletter', emails: ['a@example.com'] })

    expect(client.post).toHaveBeenCalledWith('/automations/auto1/node', { type: 'notify', subscriberListId: 'list1', emails: ['a@example.com'] })
  })

  test('add a webhook node', async () => {
    const { client, byName } = setup()
    client.post.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'add', automationId: 'auto1', nodeType: 'webhook', url: 'https://example.com', method: 'POST', includeContactData: true })

    expect(client.post).toHaveBeenCalledWith('/automations/auto1/node', { type: 'webhook', url: 'https://example.com', method: 'POST', includeContactData: true })
  })

  test('update targets a node by id without requiring nodeType', async () => {
    const { client, byName } = setup()
    client.put.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'update', automationId: 'auto1', nodeId: 'n1', duration: 5, durationType: 'day' })

    expect(client.put).toHaveBeenCalledWith('/automations/auto1/node/n1', { duration: 5, durationType: 'day' })
  })

  test('update a branch\'s own sub-condition when condition: true', async () => {
    const { client, byName } = setup()
    client.put.mockResolvedValue(baseAutomation)

    await byName.manage_automation_node.handler({ action: 'update', automationId: 'auto1', nodeId: 'b1', condition: true, property: 'plan', operator: 'equals', value: 'pro' })

    expect(client.put).toHaveBeenCalledWith('/automations/auto1/node/b1', { condition: { property: 'plan', operator: 'equals', value: 'pro' } })
  })

  test('delete removes a node by id', async () => {
    const { client, byName } = setup()
    client.del.mockResolvedValue(baseAutomation)

    const result = await byName.manage_automation_node.handler({ action: 'delete', automationId: 'auto1', nodeId: 'n1' })

    expect(client.del).toHaveBeenCalledWith('/automations/auto1/node/n1')
    expect(result.content[0].text).toContain('Deleted the step:')
  })
})

describe('manage_automation_email_content', () => {
  test('get formats a chamaileon email without a body dump', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ _id: 'email1', subject: 'Welcome', previewText: 'Hi there' })

    const result = await byName.manage_automation_email_content.handler({ action: 'get', automationId: 'auto1', emailId: 'email1' })
    expect(result.content[0].text).toBe('"Welcome" (id email1)\nPreview text: Hi there\nType: chamaileon')
  })

  test('get formats an html/text email including the body', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue({ _id: 'email1', subject: '', previewText: '', type: 'text', document: 'Hello!' })

    const result = await byName.manage_automation_email_content.handler({ action: 'get', automationId: 'auto1', emailId: 'email1' })
    expect(result.content[0].text).toContain('(no subject yet)')
    expect(result.content[0].text).toContain('Body:\nHello!')
  })

  test('update sends every provided field', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ _id: 'email1', subject: 'New subject' })

    await byName.manage_automation_email_content.handler({
      action: 'update',
      automationId: 'auto1',
      emailId: 'email1',
      subject: 'New subject',
      previewText: 'Preview',
      bodyType: 'html',
      body: '<p>hi</p>',
      senderIdentityId: 'sender1',
      replyTo: 'reply@example.com'
    })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/email/email1', {
      subject: 'New subject',
      previewText: 'Preview',
      type: 'html',
      document: '<p>hi</p>',
      senderIdentity: 'sender1',
      replyTo: 'reply@example.com'
    })
  })

  test('update omits fields that were not given', async () => {
    const { client, byName } = setup()
    client.patch.mockResolvedValue({ _id: 'email1', subject: 'Welcome' })

    await byName.manage_automation_email_content.handler({ action: 'update', automationId: 'auto1', emailId: 'email1', subject: 'Welcome' })

    expect(client.patch).toHaveBeenCalledWith('/automations/auto1/email/email1', { subject: 'Welcome' })
  })
})

describe('lifecycle tools', () => {
  const cases = [
    ['activate_automation', '/activate', 'Activated automation'],
    ['merge_automation_draft', '/merge-draft', 'Merged the staged draft into the live automation'],
    ['discard_automation_draft', '/discard-draft', 'Discarded the staged draft'],
    ['pause_automation', '/pause', 'Paused automation'],
    ['resume_automation', '/resume', 'Resumed automation']
  ]

  test.each(cases)('%s previews without confirm and applies the API call once confirmed', async (toolName, path, pastTense) => {
    const { client, byName } = setup()
    client.get.mockResolvedValue(baseAutomation)

    const preview = await byName[toolName].handler({ automationId: 'auto1' })
    expect(client.post).not.toHaveBeenCalled()
    expect(preview.content[0].text).toContain('requires confirmation')

    client.post.mockResolvedValue({ ...baseAutomation, status: 'active' })
    const applied = await byName[toolName].handler({ automationId: 'auto1', confirm: true })
    expect(client.post).toHaveBeenCalledWith(`/automations/auto1${path}`, {})
    expect(applied.content[0].text).toContain(pastTense)
  })

  test('activate_automation reports validation failure without claiming success', async () => {
    const { client, byName } = setup()
    client.get.mockResolvedValue(baseAutomation)
    client.post.mockResolvedValue({ hasErrors: true, ...baseAutomation })

    const result = await byName.activate_automation.handler({ automationId: 'auto1', confirm: true })
    expect(result.content[0].text).toContain('Validation failed - nothing was changed')
  })
})
