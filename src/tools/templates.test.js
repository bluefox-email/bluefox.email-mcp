import { describe, expect, test } from 'vitest'
import { createTemplateTools } from './templates.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired } = createResolveId(client)
  const [manageTemplates] = createTemplateTools({ client, resolveIdOrRequired })
  return { client, manageTemplates }
}

describe('manage_templates', () => {
  test('list reports no templates yet', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageTemplates.handler({ action: 'list' })
    expect(result.content[0].text).toBe('No templates exist yet.')
  })

  test('list summarizes templates and notes when more exist', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ name: 'Welcome' }] })

    const result = await manageTemplates.handler({ action: 'list' })
    expect(result.content[0].text).toBe('5 template(s): Welcome (more not shown).')
  })

  test('list omits the "more not shown" note when every template was returned', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ name: 'Welcome' }] })

    const result = await manageTemplates.handler({ action: 'list' })
    expect(result.content[0].text).toBe('1 template(s): Welcome.')
  })

  test('get resolves by name and summarizes with previewText and tags', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/templates') {
        return { items: [{ _id: 'tmpl123' }] }
      }
      return { name: 'Welcome', subject: 'Hi!', previewText: 'Glad you joined', tags: ['onboarding'] }
    })

    const result = await manageTemplates.handler({ action: 'get', templateName: 'Welcome' })
    expect(result.content[0].text).toBe('"Welcome" - subject: "Hi!", preview: "Glad you joined". Tags: onboarding.')
  })

  test('get reports no previewText or tags gracefully', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockResolvedValue({ name: 'Welcome', subject: 'Hi!' })

    const result = await manageTemplates.handler({ action: 'get', templateId: 'tmpl123' })
    expect(result.content[0].text).toBe('"Welcome" - subject: "Hi!". Tags: none.')
  })

  test('create duplicates a source template resolved by id, overriding every metadata field', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockResolvedValue({ name: 'Welcome', subject: 'Old subject', previewText: 'Old preview', document: { blocks: ['a'] }, tags: ['old'], onProjectCreation: 'do-nothing' })
    client.post.mockResolvedValue({ _id: 'tmpl456', name: 'Welcome v2' })

    const result = await manageTemplates.handler({
      action: 'create',
      sourceTemplateId: 'tmpl123',
      name: 'Welcome v2',
      subject: 'New subject',
      previewText: 'New preview',
      tags: ['new'],
      onProjectCreation: 'set-as-transactional'
    })

    expect(client.get).toHaveBeenCalledWith('/templates/tmpl123')
    expect(client.post).toHaveBeenCalledWith('/templates', {
      name: 'Welcome v2',
      subject: 'New subject',
      document: { blocks: ['a'] },
      tags: ['new'],
      previewText: 'New preview',
      onProjectCreation: 'set-as-transactional'
    })
    expect(result.content[0].text).toBe('Created template "Welcome v2" (id tmpl456) from a copy of "Welcome".')
  })

  test('create resolves the source template by name and defaults metadata to the source\'s own values', async () => {
    const { client, manageTemplates } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/templates') {
        return { items: [{ _id: 'tmpl123' }] }
      }
      return { name: 'Welcome', subject: 'Old subject', previewText: 'Old preview', document: { blocks: ['a'] }, tags: ['old'], onProjectCreation: 'do-nothing' }
    })
    client.post.mockResolvedValue({ _id: 'tmpl456', name: 'Welcome copy' })

    await manageTemplates.handler({ action: 'create', sourceTemplateName: 'Welcome', name: 'Welcome copy' })

    expect(client.post).toHaveBeenCalledWith('/templates', {
      name: 'Welcome copy',
      subject: 'Old subject',
      document: { blocks: ['a'] },
      tags: ['old'],
      previewText: 'Old preview',
      onProjectCreation: 'do-nothing'
    })
  })

  test('update sends only the given metadata fields', async () => {
    const { client, manageTemplates } = setup()
    client.patch.mockResolvedValue({ name: 'Welcome v2' })

    const result = await manageTemplates.handler({
      action: 'update',
      templateId: 'tmpl123',
      newName: 'Welcome v2',
      subject: 'New subject',
      previewText: 'New preview',
      tags: ['onboarding', 'v2'],
      onProjectCreation: 'set-as-triggered'
    })

    expect(client.patch).toHaveBeenCalledWith('/templates/tmpl123', {
      name: 'Welcome v2',
      subject: 'New subject',
      previewText: 'New preview',
      tags: ['onboarding', 'v2'],
      onProjectCreation: 'set-as-triggered'
    })
    expect(result.content[0].text).toBe('Updated template "Welcome v2".')
  })

  test('update with no fields given sends an empty patch', async () => {
    const { client, manageTemplates } = setup()
    client.patch.mockResolvedValue({ name: 'Welcome' })

    await manageTemplates.handler({ action: 'update', templateId: 'tmpl123' })
    expect(client.patch).toHaveBeenCalledWith('/templates/tmpl123', {})
  })

  test('delete removes a template by id', async () => {
    const { client, manageTemplates } = setup()
    client.del.mockResolvedValue({})

    const result = await manageTemplates.handler({ action: 'delete', templateId: 'tmpl123' })

    expect(client.del).toHaveBeenCalledWith('/templates/tmpl123')
    expect(result.content[0].text).toBe('Deleted the template.')
  })
})
