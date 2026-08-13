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
    client.get.mockResolvedValue({ name: 'My Project', status: 'production', logoUrl: 'https://example.com/logo.png', autoRemoveFromList: { bounce: 'deleteContact', complaint: 'off' }, whiteList: ['example.com', 'shop.example.com'] })

    const result = await manageProjectSettings.handler({ action: 'get' })

    expect(client.get).toHaveBeenCalledWith('')
    expect(result.content[0].text).toBe('Project "My Project" - status: production, logoUrl: https://example.com/logo.png, auto-remove on bounce: deleteContact, auto-remove on complaint: off, domain whitelist: example.com, shop.example.com.')
  })

  test('get reports no domain whitelist when unset', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox' })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('domain whitelist: none.')
  })

  test('get defaults auto-remove modes to removeFromLists when unset', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox' })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('auto-remove on bounce: removeFromLists, auto-remove on complaint: removeFromLists,')
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

  test('update replaces the domain whitelist', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', domainWhitelist: ['example.com'] })

    expect(client.patch).toHaveBeenCalledWith('', { whiteList: ['example.com'] })
  })

  test('update clears the domain whitelist with an empty array', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', domainWhitelist: [] })

    expect(client.patch).toHaveBeenCalledWith('', { whiteList: [] })
  })

  test('update sets both auto-remove modes at once without an extra lookup', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', autoRemoveOnBounce: 'deleteContact', autoRemoveOnComplaint: 'off' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.patch).toHaveBeenCalledWith('', { autoRemoveFromList: { bounce: 'deleteContact', complaint: 'off' } })
  })

  test('update sets only bounce mode, preserving the current complaint mode', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ autoRemoveFromList: { bounce: 'removeFromLists', complaint: 'deleteContact' } })
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', autoRemoveOnBounce: 'off' })

    expect(client.get).toHaveBeenCalledWith('')
    expect(client.patch).toHaveBeenCalledWith('', { autoRemoveFromList: { bounce: 'off', complaint: 'deleteContact' } })
  })

  test('update sets only complaint mode, defaulting bounce when nothing was stored', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({})
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', autoRemoveOnComplaint: 'deleteContact' })

    expect(client.patch).toHaveBeenCalledWith('', { autoRemoveFromList: { bounce: 'removeFromLists', complaint: 'deleteContact' } })
  })

  test('update sets only complaint mode, preserving a real stored bounce value', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ autoRemoveFromList: { bounce: 'deleteContact', complaint: 'removeFromLists' } })
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', autoRemoveOnComplaint: 'off' })

    expect(client.patch).toHaveBeenCalledWith('', { autoRemoveFromList: { bounce: 'deleteContact', complaint: 'off' } })
  })

  test('update sets only bounce mode, defaulting complaint when the stored object has no complaint value', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ autoRemoveFromList: {} })
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', autoRemoveOnBounce: 'deleteContact' })

    expect(client.patch).toHaveBeenCalledWith('', { autoRemoveFromList: { bounce: 'deleteContact', complaint: 'removeFromLists' } })
  })
})
