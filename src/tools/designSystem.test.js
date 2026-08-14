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
  variables: {
    colors: [{ name: 'primary', value: '#123456', main: true }, { name: 'secondary', value: '#abcdef', overridden: true }],
    images: [],
    fontStacks: [{ name: 'heading', value: 'Roboto, sans-serif', description: 'Used for headings' }],
    links: [],
    texts: []
  },
  font: { stacks: [{ name: 'body', value: 'Arial, sans-serif' }], resources: [] },
  components: {
    buttons: [{ name: 'cta', value: { backgroundColor: '#123456', borderRadius: '4px' } }],
    texts: [],
    images: [],
    dividers: []
  }
}

describe('manage_design_system', () => {
  test('get returns the full design system, including values, main flag, description, and overridden marker', async () => {
    const { client, manageDesignSystem } = setup()
    client.get.mockResolvedValue({ items: [designSystem] })

    const result = await manageDesignSystem.handler({ action: 'get' })
    const text = result.content[0].text

    expect(client.get).toHaveBeenCalledWith('/design-systems', { limit: 1 })
    expect(text).toContain('"Default" (id ds123)')
    expect(text).toContain('variables.colors: primary (main): #123456, secondary: #abcdef [overridden]')
    expect(text).toContain('variables.fontStacks: heading: Roboto, sans-serif')
    expect(text).toContain('variables.images: none')
    expect(text).toContain('font.stacks: body: Arial, sans-serif')
    expect(text).toContain('components.buttons: cta: {"backgroundColor":"#123456","borderRadius":"4px"}')
    expect(text).toContain('components.texts: none')
  })

  test('set_overrides patches the design system by its own id and returns the resulting detail', async () => {
    const { client, manageDesignSystem } = setup()
    client.get.mockResolvedValue({ items: [designSystem] })
    client.patch.mockResolvedValue(designSystem)

    const setOverrides = [{ category: 'variables', key: 'colors', name: 'primary', value: '#123456' }]
    const result = await manageDesignSystem.handler({ action: 'set_overrides', setOverrides })

    expect(client.patch).toHaveBeenCalledWith('/design-systems/ds123', { setOverrides })
    expect(result.content[0].text).toContain('Applied the design system override(s).')
    expect(result.content[0].text).toContain('variables.colors:')
  })

  test('reset_overrides patches with resetOverrides and returns the resulting detail', async () => {
    const { client, manageDesignSystem } = setup()
    client.get.mockResolvedValue({ items: [designSystem] })
    client.patch.mockResolvedValue(designSystem)

    const resetOverrides = [{ category: 'variables', key: 'colors', name: 'primary' }]
    const result = await manageDesignSystem.handler({ action: 'reset_overrides', resetOverrides })

    expect(client.patch).toHaveBeenCalledWith('/design-systems/ds123', { resetOverrides })
    expect(result.content[0].text).toContain('Reset the design system override(s).')
    expect(result.content[0].text).toContain('variables.colors:')
  })
})
