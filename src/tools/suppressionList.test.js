import { describe, expect, test } from 'vitest'
import { createSuppressionListTools } from './suppressionList.js'
import { createFakeClient } from '../helpers/fakeClient.js'

function setup () {
  const client = createFakeClient()
  const [manageSuppressionList] = createSuppressionListTools({ client })
  return { client, manageSuppressionList }
}

describe('manage_suppression_list', () => {
  test('list reports an empty list', async () => {
    const { client, manageSuppressionList } = setup()
    client.get.mockResolvedValue({ count: 0, items: [] })

    const result = await manageSuppressionList.handler({ action: 'list' })
    expect(result.content[0].text).toBe('The suppression list is empty.')
  })

  test('list summarizes entries with and without a reason', async () => {
    const { client, manageSuppressionList } = setup()
    client.get.mockResolvedValue({
      count: 2,
      items: [{ email: 'a@example.com', reason: 'bounced' }, { email: 'b@example.com' }]
    })

    const result = await manageSuppressionList.handler({ action: 'list' })
    expect(result.content[0].text).toBe('2 entr(y/ies): a@example.com (bounced), b@example.com.')
  })

  test('list notes when more entries exist than were shown', async () => {
    const { client, manageSuppressionList } = setup()
    client.get.mockResolvedValue({ count: 5, items: [{ email: 'a@example.com' }] })

    const result = await manageSuppressionList.handler({ action: 'list' })
    expect(result.content[0].text).toBe('5 entr(y/ies): a@example.com (more not shown).')
  })

  test('list omits the "more not shown" note when every entry was returned', async () => {
    const { client, manageSuppressionList } = setup()
    client.get.mockResolvedValue({ count: 1, items: [{ email: 'a@example.com' }] })

    const result = await manageSuppressionList.handler({ action: 'list' })
    expect(result.content[0].text).toBe('1 entr(y/ies): a@example.com.')
  })

  test('add posts email and reason', async () => {
    const { client, manageSuppressionList } = setup()
    client.post.mockResolvedValue({ email: 'a@example.com' })

    const result = await manageSuppressionList.handler({ action: 'add', email: 'a@example.com', reason: 'manual block' })

    expect(client.post).toHaveBeenCalledWith('/suppression-list', { email: 'a@example.com', reason: 'manual block' })
    expect(result.content[0].text).toBe('Added a@example.com to the suppression list.')
  })

  test('remove deletes directly by entryId when already known', async () => {
    const { client, manageSuppressionList } = setup()
    client.del.mockResolvedValue({})

    const result = await manageSuppressionList.handler({ action: 'remove', entryId: 'entry123' })

    expect(client.get).not.toHaveBeenCalled()
    expect(client.del).toHaveBeenCalledWith('/suppression-list/entry123')
    expect(result.content[0].text).toBe('Removed the entry from the suppression list.')
  })

  test('remove resolves the entry by email first', async () => {
    const { client, manageSuppressionList } = setup()
    client.get.mockResolvedValue({ items: [{ _id: 'entry123' }] })
    client.del.mockResolvedValue({})

    await manageSuppressionList.handler({ action: 'remove', email: 'a@example.com' })

    expect(client.get).toHaveBeenCalledWith('/suppression-list', { filter: { email: 'a@example.com' }, limit: 2 })
    expect(client.del).toHaveBeenCalledWith('/suppression-list/entry123')
  })

  test('remove throws a clear error when the email is not on the list', async () => {
    const { client, manageSuppressionList } = setup()
    client.get.mockResolvedValue({ items: [] })

    await expect(manageSuppressionList.handler({ action: 'remove', email: 'ghost@example.com' }))
      .rejects.toThrow('"ghost@example.com" is not on the suppression list.')
  })

  test('remove throws when neither entryId nor email is given', async () => {
    const { manageSuppressionList } = setup()

    await expect(manageSuppressionList.handler({ action: 'remove' }))
      .rejects.toThrow('Either an entryId or an email is required')
  })
})
