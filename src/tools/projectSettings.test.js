import { describe, expect, test } from 'vitest'
import { createProjectSettingsTools } from './projectSettings.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageProjectSettings] = createProjectSettingsTools({ client })
  return { client, manageProjectSettings }
}

describe('manage_project_settings', () => {
  test('get returns a summary, including the unengaged-contact segment', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({
      name: 'My Project',
      status: 'production',
      logoUrl: 'https://example.com/logo.png',
      autoRemoveFromList: { bounce: 'deleteContact', complaint: 'off' },
      whiteList: ['example.com', 'shop.example.com'],
      unengagedContactSegment: { groups: [{ conditions: [{ operator: 'not-opened' }] }] }
    })

    const result = await manageProjectSettings.handler({ action: 'get' })
    const text = result.content[0].text

    expect(client.get).toHaveBeenCalledWith('')
    expect(text).toContain('Project "My Project" - status: production, logoUrl: https://example.com/logo.png, custom subscription preferences URL: none (using bluefox.email\'s default page), auto-remove on bounce: deleteContact, auto-remove on complaint: off, domain whitelist: example.com, shop.example.com.')
    expect(text).toContain('Unengaged contact segment: Group 1 (OR): not-opened')
  })

  test('get reports the unengaged-contact segment as not configured when unset', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox' })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('Unengaged contact segment: not configured')
  })

  test('get reports a group with no conditions in the unengaged-contact segment', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox', unengagedContactSegment: { groups: [{ conditions: [] }] } })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('Group 1 (OR): (no conditions - matches everyone)')
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

  test('get reports no custom subscription preferences URL when none is set', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox' })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('custom subscription preferences URL: none (using bluefox.email\'s default page)')
  })

  test('get reports the custom subscription preferences URL when set', async () => {
    const { client, manageProjectSettings } = setup()
    client.get.mockResolvedValue({ name: 'My Project', status: 'sandbox', customSubscriptionPreferencesUrl: 'example.com/preferences' })

    const result = await manageProjectSettings.handler({ action: 'get' })
    expect(result.content[0].text).toContain('custom subscription preferences URL: example.com/preferences')
  })

  test('update sends only the given fields and returns the resulting full settings', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'New Name', status: 'sandbox' })

    const result = await manageProjectSettings.handler({ action: 'update', name: 'New Name' })

    expect(client.patch).toHaveBeenCalledWith('', { name: 'New Name' })
    expect(result.content[0].text).toContain('Updated project "New Name" - status: sandbox')
    expect(result.content[0].text).toContain('Unengaged contact segment: not configured')
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

  test('update clears logoUrl when explicitly given an empty string', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', logoUrl: '' })

    expect(client.patch).toHaveBeenCalledWith('', { logoUrl: '' })
  })

  test('update can set customSubscriptionPreferencesUrl', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project', customSubscriptionPreferencesUrl: 'example.com/preferences' })

    await manageProjectSettings.handler({ action: 'update', customSubscriptionPreferencesUrl: 'example.com/preferences' })

    expect(client.patch).toHaveBeenCalledWith('', { customSubscriptionPreferencesUrl: 'example.com/preferences' })
  })

  test('update clears customSubscriptionPreferencesUrl when explicitly given an empty string', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project' })

    await manageProjectSettings.handler({ action: 'update', customSubscriptionPreferencesUrl: '' })

    expect(client.patch).toHaveBeenCalledWith('', { customSubscriptionPreferencesUrl: '' })
  })

  test('update replaces the domain whitelist and echoes the resulting list', async () => {
    const { client, manageProjectSettings } = setup()
    client.patch.mockResolvedValue({ name: 'My Project', whiteList: ['example.com'] })

    const result = await manageProjectSettings.handler({ action: 'update', domainWhitelist: ['example.com'] })

    expect(client.patch).toHaveBeenCalledWith('', { whiteList: ['example.com'] })
    expect(result.content[0].text).toContain('domain whitelist: example.com.')
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
