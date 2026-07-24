import { describe, expect, test } from 'vitest'
import { createDesignSystemTools } from './designSystem.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageDesignSystem] = createDesignSystemTools({ client })
  return { client, manageDesignSystem }
}

const designSystem = {
  _id: 'ds123',
  name: 'Default',
  variables: { colors: [{ name: 'primary' }], images: [], fontStacks: [], links: [], texts: [] },
  font: { stacks: [{ name: 'body' }], resources: [] },
  components: { buttons: [{ name: 'cta' }], texts: [], images: [], dividers: [] }
}

describe('manage_design_system', () => {
  test('get returns a summary of the design system', async () => {
    const { client, manageDesignSystem } = setup()
    client.get.mockResolvedValue({ items: [designSystem] })

    const result = await manageDesignSystem.handler({ action: 'get' })

    expect(client.get).toHaveBeenCalledWith('/design-systems', { limit: 1 })
    expect(result.content[0].text).toBe('Design system "Default" - 1 colors, 0 images, 1 font stacks, 1 button styles, 0 text styles.')
  })

  test('set_overrides patches the design system by its own id', async () => {
    const { client, manageDesignSystem } = setup()
    client.get.mockResolvedValue({ items: [designSystem] })
    client.patch.mockResolvedValue({})

    const setOverrides = [{ category: 'variables', key: 'colors', name: 'primary', value: '#123456' }]
    const result = await manageDesignSystem.handler({ action: 'set_overrides', setOverrides })

    expect(client.patch).toHaveBeenCalledWith('/design-systems/ds123', { setOverrides })
    expect(result.content[0].text).toBe('Applied the design system override(s).')
  })

  test('reset_overrides patches with resetOverrides', async () => {
    const { client, manageDesignSystem } = setup()
    client.get.mockResolvedValue({ items: [designSystem] })
    client.patch.mockResolvedValue({})

    const resetOverrides = [{ category: 'variables', key: 'colors', name: 'primary' }]
    const result = await manageDesignSystem.handler({ action: 'reset_overrides', resetOverrides })

    expect(client.patch).toHaveBeenCalledWith('/design-systems/ds123', { resetOverrides })
    expect(result.content[0].text).toBe('Reset the design system override(s).')
  })
})
