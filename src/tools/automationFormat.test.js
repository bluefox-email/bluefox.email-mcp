import { describe, expect, test } from 'vitest'
import { formatAutomationDetail, formatAutomationSummaryLine, formatTrigger, formatExitCriteria } from './automationFormat.js'

describe('formatTrigger', () => {
  test('reports when no trigger is configured', () => {
    expect(formatTrigger(undefined)).toBe('No trigger configured yet.')
    expect(formatTrigger({})).toBe('No trigger configured yet.')
  })

  test('contact-added', () => {
    expect(formatTrigger({ type: 'contact-added', subscriberListId: 'list1' })).toBe('When a contact is added to list list1.')
  })

  test('contact-updated with from/to', () => {
    const text = formatTrigger({ type: 'contact-updated', subscriberListId: 'list1', property: 'plan', from: { operator: 'equals', value: 'free' }, to: { operator: 'equals', value: 'pro' } })
    expect(text).toBe('When a contact on list list1 has "plan" changed from equals "free" to equals "pro".')
  })

  test('contact-updated without from/to', () => {
    expect(formatTrigger({ type: 'contact-updated', subscriberListId: 'list1', property: 'plan' })).toBe('When a contact on list list1 has "plan" changed.')
  })

  test('enter-segment', () => {
    expect(formatTrigger({ type: 'enter-segment', subscriberListId: 'list1', segmentId: 'seg1' })).toBe('When a contact on list list1 enters segment seg1.')
  })

  test('leave-segment', () => {
    expect(formatTrigger({ type: 'leave-segment', subscriberListId: 'list1', segmentId: 'seg1' })).toBe('When a contact on list list1 leaves segment seg1.')
  })

  test('time-based with dayOf/nthOf', () => {
    const text = formatTrigger({ type: 'time-based', subscriberListId: 'list1', schedule: 'monthly-on-the-nth', dayOf: 'tuesday', nthOf: 2, time: '08:00' })
    expect(text).toBe('On a monthly-on-the-nth schedule at 08:00, day "tuesday", occurrence 2, for every contact on list list1.')
  })

  test('time-based defaults time to 09:00 and omits dayOf/nthOf when absent', () => {
    expect(formatTrigger({ type: 'time-based', subscriberListId: 'list1', schedule: 'daily' })).toBe('On a daily schedule at 09:00, for every contact on list list1.')
  })

  test('unrecognized trigger type', () => {
    expect(formatTrigger({ type: 'mystery' })).toBe('Unrecognized trigger type "mystery".')
  })
})

describe('formatExitCriteria', () => {
  test('reports no exit criteria when inactive or absent', () => {
    expect(formatExitCriteria(undefined)).toBe('No exit criteria - contacts only leave when they finish or are excluded.')
    expect(formatExitCriteria({ active: false })).toBe('No exit criteria - contacts only leave when they finish or are excluded.')
  })

  test('active with a segment and excludeUnengaged and leaveSegment', () => {
    const text = formatExitCriteria({ active: true, segmentId: 'seg1', excludeUnengaged: true, leaveSegment: true })
    expect(text).toBe('Exits early when in segment seg1, unengaged (also removes them from the segment).')
  })

  test('active with only a property/operator/value condition', () => {
    const text = formatExitCriteria({ active: true, property: 'status', operator: 'equals', value: 'churned' })
    expect(text).toBe('Exits early when status equals "churned".')
  })

  test('active with none of the specific fields falls back to "any"', () => {
    expect(formatExitCriteria({ active: true })).toBe('Exits early when any.')
  })
})

describe('formatAutomationDetail', () => {
  test('formats an empty draft automation with no nodes', () => {
    const text = formatAutomationDetail({
      _id: 'auto1',
      name: 'Welcome flow',
      status: 'draft',
      trigger: { type: 'contact-added', subscriberListId: 'list1' },
      exitCriteria: { active: false },
      sequence: []
    })
    expect(text).toContain('"Welcome flow" (id auto1) - status: draft')
    expect(text).toContain('When a contact is added to list list1.')
    expect(text).toContain('No exit criteria')
    expect(text).toContain('(empty)')
  })

  test('formats a sequence with every node type, including validation errors', () => {
    const automation = {
      _id: 'auto1',
      name: 'Full flow',
      status: 'active',
      trigger: { type: 'contact-added', subscriberListId: 'list1' },
      exitCriteria: { active: false },
      sequence: [
        { _id: 'n1', type: 'delay', duration: 2, durationType: 'day' },
        { _id: 'n2', type: 'delay', durationType: 'wait-until-time', waitUntilTime: '08:00' },
        { _id: 'n3', type: 'delay', durationType: 'wait-until-day', waitUntilDay: 'monday' },
        { _id: 'n4', type: 'delay', durationType: 'wait-until-weekday' },
        { _id: 'n4b', type: 'delay', durationType: 'wait-until-weekday', waitUntilTime: '08:00' },
        { _id: 'n5', type: 'send-email', emailId: 'email1' },
        { _id: 'n6', type: 'send-email', emailId: null, error: ['Missing required field'] },
        { _id: 'n7', type: 'notify', emailId: 'email2', subscriberListId: 'list1', emails: ['a@example.com'] },
        { _id: 'n7b', type: 'notify', emailId: null, subscriberListId: null, emails: [] },
        { _id: 'n8', type: 'filter-audience', property: 'plan', operator: 'equals', value: 'pro' },
        { _id: 'n8b', type: 'filter-audience', excludeUnengaged: true },
        { _id: 'n8c', type: 'filter-audience', operator: 'is-true' },
        { _id: 'n8d', type: 'filter-audience', property: 'plan' },
        { _id: 'n9', type: 'set-value', property: 'stage', value: 'won' },
        { _id: 'n10', type: 'manage-tags', addValue: ['vip'], removeValue: ['trial'] },
        { _id: 'n10b', type: 'manage-tags' },
        { _id: 'n11', type: 'webhook', url: 'https://example.com/hook', method: 'POST' },
        { _id: 'n11b', type: 'webhook' },
        { _id: 'n12', type: 'complete' },
        { _id: 'n13', type: 'mystery-node' },
        { _id: 'n13b', type: 'delay', duration: 1, durationType: 'day', pendingDeletion: true },
        { _id: 'n13c', type: 'send-email', emailId: 'email3', emailDeleted: true },
        {
          _id: 'n14',
          type: 'branch',
          branches: [
            { _id: 'b1', condition: { segmentId: 'seg1' }, sequence: [{ _id: 'n15', type: 'complete' }] },
            { _id: 'b2', condition: {}, sequence: [] },
            { _id: 'b3', sequence: [] },
            { _id: 'b4', pendingDeletion: true, sequence: [] }
          ]
        }
      ]
    }

    const text = formatAutomationDetail(automation)
    expect(text).toContain('Wait 2 day(s)')
    expect(text).toContain('Wait until 08:00')
    expect(text).toContain('Wait until monday')
    expect(text).toContain('Wait until the next weekday')
    expect(text).toContain('Wait until the next weekday at 08:00')
    expect(text).toContain('Send email (emailId email1)')
    expect(text).toContain('not set yet - use manage_automation_email_content')
    expect(text).toContain('⚠ Missing required field')
    expect(text).toContain('Notify (emailId email2, list list1, extra recipients: a@example.com)')
    expect(text).toContain('Notify (emailId not set yet, list n/a)')
    expect(text).toContain('Filter audience: plan equals "pro"')
    expect(text).toContain('Filter audience: unengaged')
    expect(text).toContain('Filter audience: is-true')
    expect(text).toContain('Filter audience: plan any')
    expect(text).toContain('Set stage = "won"')
    expect(text).toContain('Manage tags: +[vip] -[trial]')
    expect(text).toContain('Manage tags: +[] -[]')
    expect(text).toContain('Webhook: POST https://example.com/hook')
    expect(text).toContain('Webhook: POST (no url set)')
    expect(text).toContain('End automation')
    expect(text).toContain('Unrecognized node type "mystery-node"')
    expect(text).toContain('Branch 1 (id b1) if in segment seg1:')
    expect(text).toContain('Branch 2 (id b2) if any:')
    expect(text).toContain('Branch 3 (id b3) if any:')
    expect(text).toContain('- [delay] (id n13b) Wait 1 day(s) [PENDING DELETION - will be removed once this draft is merged]')
    expect(text).toContain('- [send-email] (id n13c) Send email (emailId email3) [PENDING DELETION - will be removed once this draft is merged]')
    expect(text).toContain('Branch 4 (id b4) [PENDING DELETION] if any:')
  })

  test('reports pending draft trigger, exit criteria, and sequence', () => {
    const automation = {
      _id: 'auto1',
      name: 'Live flow',
      status: 'active',
      trigger: { type: 'contact-added', subscriberListId: 'list1' },
      exitCriteria: { active: false },
      sequence: [{ _id: 'n1', type: 'complete' }],
      draftTrigger: { type: 'enter-segment', subscriberListId: 'list1', segmentId: 'seg1' },
      draftExitCriteria: { active: true, excludeUnengaged: true },
      draftSequence: [{ _id: 'n1', type: 'complete' }, { _id: 'n2', type: 'delay', duration: 1, durationType: 'day' }]
    }

    const text = formatAutomationDetail(automation)
    expect(text).toContain('Draft changes staged but NOT yet live')
    expect(text).toContain('New trigger: When a contact on list list1 enters segment seg1.')
    expect(text).toContain('New exit criteria: Exits early when unengaged.')
    expect(text).toContain('New sequence (2 step(s) staged, vs 1 live):')
  })
})

describe('formatAutomationSummaryLine', () => {
  test('formats a name/id/status one-liner', () => {
    expect(formatAutomationSummaryLine({ name: 'Welcome flow', _id: 'auto1', status: 'active' })).toBe('"Welcome flow" (id auto1) - active')
  })
})
