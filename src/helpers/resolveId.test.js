import { describe, expect, test, vi } from 'vitest'
import { createResolveId } from './resolveId.js'
import { ResolveError } from './errors.js'

function fakeClient (items) {
  return { get: vi.fn().mockResolvedValue({ items, count: items.length }) }
}

describe('resolveId', () => {
  test('resolves to the single matching item\'s id', async () => {
    const client = fakeClient([{ _id: 'list123', name: 'Newsletter' }])
    const { resolveId } = createResolveId(client)

    const id = await resolveId({ resourcePath: '/subscriber-lists', name: 'Newsletter', filterField: 'name', label: 'subscriber list' })

    expect(id).toBe('list123')
    expect(client.get).toHaveBeenCalledWith('/subscriber-lists', { filter: { name: 'Newsletter' }, limit: 2 })
  })

  test('throws a ResolveError when the client returns no result at all', async () => {
    const client = { get: vi.fn().mockResolvedValue(undefined) }
    const { resolveId } = createResolveId(client)

    await expect(resolveId({ resourcePath: '/subscriber-lists', name: 'Ghost List', filterField: 'name', label: 'subscriber list' }))
      .rejects.toThrow(ResolveError)
  })

  test('throws a ResolveError when nothing matches', async () => {
    const client = fakeClient([])
    const { resolveId } = createResolveId(client)

    await expect(resolveId({ resourcePath: '/subscriber-lists', name: 'Ghost List', filterField: 'name', label: 'subscriber list' }))
      .rejects.toThrow(ResolveError)
    await expect(resolveId({ resourcePath: '/subscriber-lists', name: 'Ghost List', filterField: 'name', label: 'subscriber list' }))
      .rejects.toThrow('No subscriber list named "Ghost List" found')
  })

  test('throws a ResolveError when more than one item matches', async () => {
    const client = fakeClient([{ _id: 'a', name: 'Newsletter' }, { _id: 'b', name: 'Newsletter' }])
    const { resolveId } = createResolveId(client)

    await expect(resolveId({ resourcePath: '/subscriber-lists', name: 'Newsletter', filterField: 'name', label: 'subscriber list' }))
      .rejects.toThrow('Multiple subscriber lists are named "Newsletter"')
  })
})

describe('resolveIdOrRequired', () => {
  test('returns the id directly without calling the client when id is given', async () => {
    const client = fakeClient([])
    const { resolveIdOrRequired } = createResolveId(client)

    const id = await resolveIdOrRequired({ id: 'list123', resourcePath: '/subscriber-lists', filterField: 'name', label: 'subscriber list' })

    expect(id).toBe('list123')
    expect(client.get).not.toHaveBeenCalled()
  })

  test('resolves by name when only a name is given', async () => {
    const client = fakeClient([{ _id: 'list123', name: 'Newsletter' }])
    const { resolveIdOrRequired } = createResolveId(client)

    const id = await resolveIdOrRequired({ name: 'Newsletter', resourcePath: '/subscriber-lists', filterField: 'name', label: 'subscriber list' })

    expect(id).toBe('list123')
  })

  test('throws a ResolveError when neither id nor name is given', async () => {
    const client = fakeClient([])
    const { resolveIdOrRequired } = createResolveId(client)

    await expect(resolveIdOrRequired({ resourcePath: '/subscriber-lists', filterField: 'name', label: 'subscriber list' }))
      .rejects.toThrow('Either a subscriber list id or name is required.')
  })
})

describe('resolveIdOptional', () => {
  test('returns the id directly without calling the client when id is given', async () => {
    const client = fakeClient([])
    const { resolveIdOptional } = createResolveId(client)

    const id = await resolveIdOptional({ id: 'seg123', resourcePath: '/segments', filterField: 'name', label: 'segment' })

    expect(id).toBe('seg123')
    expect(client.get).not.toHaveBeenCalled()
  })

  test('returns undefined when neither id nor name is given', async () => {
    const client = fakeClient([])
    const { resolveIdOptional } = createResolveId(client)

    const id = await resolveIdOptional({ resourcePath: '/segments', filterField: 'name', label: 'segment' })

    expect(id).toBeUndefined()
    expect(client.get).not.toHaveBeenCalled()
  })

  test('resolves by name when a name is given', async () => {
    const client = fakeClient([{ _id: 'seg123', name: 'VIP' }])
    const { resolveIdOptional } = createResolveId(client)

    const id = await resolveIdOptional({ name: 'VIP', resourcePath: '/segments', filterField: 'name', label: 'segment' })

    expect(id).toBe('seg123')
  })
})
