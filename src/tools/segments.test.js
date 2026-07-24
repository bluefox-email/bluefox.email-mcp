import { describe, expect, test } from 'vitest'
import { createSegmentTools } from './segments.js'
import { createResolveId } from '../helpers/resolveId.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const { resolveIdOrRequired } = createResolveId(client)
  const [manageSegment] = createSegmentTools({ client, resolveIdOrRequired })
  return { client, manageSegment }
}

describe('manage_segment', () => {
  test('list reports no segments yet', async () => {
    const { client, manageSegment } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageSegment.handler({ action: 'list' })
    expect(result.content[0].text).toBe('No segments are defined yet.')
  })

  test('list summarizes segments and notes when more exist', async () => {
    const { client, manageSegment } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ name: 'VIP' }] })

    const result = await manageSegment.handler({ action: 'list' })
    expect(result.content[0].text).toBe('5 segment(s): VIP (more not shown).')
  })

  test('list omits the "more not shown" note when every segment was returned', async () => {
    const { client, manageSegment } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ name: 'VIP' }] })

    const result = await manageSegment.handler({ action: 'list' })
    expect(result.content[0].text).toBe('1 segment(s): VIP.')
  })

  test('create posts name and groups', async () => {
    const { client, manageSegment } = setup()
    const groups = [{ conditions: [{ operator: 'has-tag', value: 'vip' }] }]
    client.post.mockResolvedValue({ _id: 'seg123', name: 'VIP' })

    const result = await manageSegment.handler({ action: 'create', name: 'VIP', groups })

    expect(client.post).toHaveBeenCalledWith('/segments', { name: 'VIP', groups })
    expect(result.content[0].text).toBe('Created segment "VIP" (id seg123).')
  })

  test('get resolves by name and summarizes group/condition counts', async () => {
    const { client, manageSegment } = setup()
    client.get.mockImplementation(async path => {
      if (path === '/segments') {
        return { items: [{ _id: 'seg123' }] }
      }
      return { name: 'VIP', groups: [{ conditions: [{}, {}] }, { conditions: [{}] }] }
    })

    const result = await manageSegment.handler({ action: 'get', segmentName: 'VIP' })
    expect(result.content[0].text).toBe('"VIP" - 2 group(s), 3 total condition(s).')
  })

  test('update sends only the given fields', async () => {
    const { client, manageSegment } = setup()
    client.patch.mockResolvedValue({ name: 'VIP+' })

    const result = await manageSegment.handler({ action: 'update', segmentId: 'seg123', name: 'VIP+' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.patch).toHaveBeenCalledWith('/segments/seg123', { name: 'VIP+' })
    expect(result.content[0].text).toBe('Updated segment "VIP+".')
  })

  test('update can replace groups', async () => {
    const { client, manageSegment } = setup()
    const groups = [{ conditions: [{ operator: 'any' }] }]
    client.patch.mockResolvedValue({ name: 'VIP' })

    await manageSegment.handler({ action: 'update', segmentId: 'seg123', groups })
    expect(client.patch).toHaveBeenCalledWith('/segments/seg123', { groups })
  })

  test('delete removes a segment by id', async () => {
    const { client, manageSegment } = setup()
    client.del.mockResolvedValue({})

    const result = await manageSegment.handler({ action: 'delete', segmentId: 'seg123' })

    expect(client.del).toHaveBeenCalledWith('/segments/seg123')
    expect(result.content[0].text).toBe('Deleted the segment.')
  })
})
