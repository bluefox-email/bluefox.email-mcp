export function formatTrigger (trigger) {
  if (!trigger || !trigger.type) {
    return 'No trigger configured yet.'
  }
  switch (trigger.type) {
    case 'contact-added':
      return `When a contact is added to list ${trigger.subscriberListId}.`
    case 'contact-updated':
      return `When a contact on list ${trigger.subscriberListId} has "${trigger.property}" changed${trigger.from?.operator ? ` from ${trigger.from.operator} ${JSON.stringify(trigger.from.value)}` : ''}${trigger.to?.operator ? ` to ${trigger.to.operator} ${JSON.stringify(trigger.to.value)}` : ''}.`
    case 'enter-segment':
      return `When a contact on list ${trigger.subscriberListId} enters segment ${trigger.segmentId}.`
    case 'leave-segment':
      return `When a contact on list ${trigger.subscriberListId} leaves segment ${trigger.segmentId}.`
    case 'time-based': {
      const dayOf = trigger.dayOf !== undefined ? `, day ${JSON.stringify(trigger.dayOf)}` : ''
      const nthOf = trigger.nthOf !== undefined ? `, occurrence ${trigger.nthOf}` : ''
      return `On a ${trigger.schedule} schedule at ${trigger.time || '09:00'}${dayOf}${nthOf}, for every contact on list ${trigger.subscriberListId}.`
    }
    default:
      return `Unrecognized trigger type "${trigger.type}".`
  }
}

function formatConditionText (condition) {
  if (!condition) {
    return 'any'
  }
  const parts = []
  if (condition.segmentId) {
    parts.push(`in segment ${condition.segmentId}`)
  }
  if (condition.excludeUnengaged) {
    parts.push('unengaged')
  }
  if (condition.property || condition.operator) {
    const value = condition.value !== undefined ? ` ${JSON.stringify(condition.value)}` : ''
    parts.push(`${condition.property || ''} ${condition.operator || 'any'}${value}`.trim())
  }
  return parts.length ? parts.join(', ') : 'any'
}

export function formatExitCriteria (exitCriteria) {
  if (!exitCriteria || !exitCriteria.active) {
    return 'No exit criteria - contacts only leave when they finish or are excluded.'
  }
  const leave = exitCriteria.leaveSegment ? ' (also removes them from the segment)' : ''
  return `Exits early when ${formatConditionText(exitCriteria)}${leave}.`
}

function formatNodeSummary (node) {
  switch (node.type) {
    case 'delay': {
      if (node.durationType === 'wait-until-time') {
        return `Wait until ${node.waitUntilTime}`
      }
      if (node.durationType === 'wait-until-day') {
        return `Wait until ${node.waitUntilDay} ${node.waitUntilTime || ''}`.trim()
      }
      if (node.durationType === 'wait-until-weekday') {
        return `Wait until the next weekday${node.waitUntilTime ? ` at ${node.waitUntilTime}` : ''}`
      }
      return `Wait ${node.duration} ${node.durationType}(s)`
    }
    case 'send-email':
      return `Send email (emailId ${node.emailId || 'not set yet - use manage_automation_email_content'})`
    case 'notify':
      return `Notify (emailId ${node.emailId || 'not set yet'}, list ${node.subscriberListId || 'n/a'}${node.emails?.length ? `, extra recipients: ${node.emails.join(', ')}` : ''})`
    case 'filter-audience':
      return `Filter audience: ${formatConditionText(node)} - non-matching contacts exit here`
    case 'set-value':
      return `Set ${node.property} = ${JSON.stringify(node.value)}`
    case 'manage-tags':
      return `Manage tags: +[${(node.addValue || []).join(', ')}] -[${(node.removeValue || []).join(', ')}]`
    case 'webhook':
      return `Webhook: ${node.method || 'POST'} ${node.url || '(no url set)'}`
    case 'complete':
      return 'End automation'
    case 'branch':
      return 'Branch:'
    default:
      return `Unrecognized node type "${node.type}"`
  }
}

function formatSequence (sequence, indent) {
  const pad = '  '.repeat(indent)
  if (!sequence || sequence.length === 0) {
    return `${pad}(empty)`
  }
  return sequence.map(node => {
    const errors = node.error?.length ? ` ⚠ ${node.error.join('; ')}` : ''
    let line = `${pad}- [${node.type}] (id ${node._id}) ${formatNodeSummary(node)}${errors}`
    if (node.type === 'branch') {
      line += node.branches.map((branch, index) =>
        `\n${pad}  Branch ${index + 1} (id ${branch._id}) if ${formatConditionText(branch.condition)}:\n${formatSequence(branch.sequence, indent + 2)}`
      ).join('')
    }
    return line
  }).join('\n')
}

// The single formatter every `get` action and every unconfirmed lifecycle-tool call routes through, so the
// calling model always sees the same complete picture - trigger, exit criteria, live sequence, and (critically)
// anything currently staged as an unmerged draft - before it summarizes the automation back to the user.
export function formatAutomationDetail (automation) {
  const lines = [
    `"${automation.name}" (id ${automation._id}) - status: ${automation.status}`,
    formatTrigger(automation.trigger),
    formatExitCriteria(automation.exitCriteria),
    'Sequence:',
    formatSequence(automation.sequence, 0)
  ]

  const hasDraft = automation.draftSequence || automation.draftTrigger || automation.draftExitCriteria
  if (hasDraft) {
    lines.push('')
    lines.push('Draft changes staged but NOT yet live - call merge_automation_draft (or discard_automation_draft) with confirm: true to resolve:')
    if (automation.draftTrigger) {
      lines.push(`- New trigger: ${formatTrigger(automation.draftTrigger)}`)
    }
    if (automation.draftExitCriteria) {
      lines.push(`- New exit criteria: ${formatExitCriteria(automation.draftExitCriteria)}`)
    }
    if (automation.draftSequence) {
      lines.push(`- New sequence (${automation.draftSequence.length} step(s) staged, vs ${automation.sequence.length} live):`)
      lines.push(formatSequence(automation.draftSequence, 1))
    }
  }

  return lines.join('\n')
}

export function formatAutomationSummaryLine (automation) {
  return `"${automation.name}" (id ${automation._id}) - ${automation.status}`
}
