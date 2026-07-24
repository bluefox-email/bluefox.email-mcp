import { describe, expect, test } from 'vitest'
import { createProjectSettingsTools } from './projectSettings.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageProjectSettings] = createProjectSettingsTools({ client })
  return { client, manageProjectSettings }
}

describe('manage_project_settings', () => {
  test('get returns a summary', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'production', logoUrl: 'https://example.com/logo.png' })

    const result = await manageProjectSettings.handler({ action: 'get' })

    expect(client.get).toHaveBeenCalledWith('')
    expect(result.content[0].text).toBe('Project "My Project" - status: production, logoUrl: https://example.com/logo.png.')
  })

  test('get reports no logo when none is set', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox' })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('logoUrl: none')
  })

  test('update sends only the given fields', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'New Name' })

    const result = await manageProjectSettings.handler({ action: 'update', name: 'New Name' })

    expect(client.patch).toHaveBeenCalledWith('', { name: 'New Name' })
    expect(result.content[0].text).toBe('Updated project settings - name is now "New Name".')
  })

  test('update can set logoUrl and the unengaged-contact segment together', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({
      action: 'update',
      logoUrl: 'https://example.com/logo.png',
      unengagedContactSegmentGroups: [{ conditions: [{ operator: 'not-opened' }] }]
    })

    expect(client.patch).toHaveBeenCalledWith('', {
      logoUrl: 'https://example.com/logo.png',
      unengagedContactSegment: { groups: [{ conditions: [{ operator: 'not-opened' }] }] }
    })
  })
})
