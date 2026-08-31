import { describe, expect, test, vi, afterEach } from 'vitest'
import { createBluefoxClient } from './bluefoxClient.js'
import { BluefoxApiError } from './errors.js'

function mockFetchOnce (status, body) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  })
}

describe('createBluefoxClient', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const client = createBluefoxClient({ baseUrl: 'https://api.bluefox.email', projectId: 'proj1', apiKey: 'key1' })

  test('get() builds a project-scoped URL and attaches the Authorization header', async () => {
    const fetchSpy = mockFetchOnce(200, { status: 200, result: { items: [], count: 0 } })
    const result = await client.get('/campaigns')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.bluefox.email/v1/projectId/proj1/campaigns',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer key1' })
      })
    )
    expect(result).toEqual({ items: [], count: 0 })
  })

  test('get() serializes a filter object as filter[field]=value query params', async () => {
    const fetchSpy = mockFetchOnce(200, { status: 200, result: {} })
    await client.get('/subscriber-lists', { filter: { name: 'Newsletter' }, limit: 2 })

    const url = fetchSpy.mock.calls[0][0]
    expect(url).toContain('filter%5Bname%5D=Newsletter')
    expect(url).toContain('limit=2')
  })

  test('get() omits the "?" entirely when every query value is undefined', async () => {
    const fetchSpy = mockFetchOnce(200, { status: 200, result: {} })
    await client.get('/campaigns', { limit: undefined })

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.bluefox.email/v1/projectId/proj1/campaigns')
  })

  test('get() omits undefined query values, both at the top level and inside filter', async () => {
    const fetchSpy = mockFetchOnce(200, { status: 200, result: {} })
    await client.get('/campaigns', { limit: undefined, filter: { name: 'Newsletter', status: undefined } })

    const url = fetchSpy.mock.calls[0][0]
    expect(url).not.toContain('limit')
    expect(url).not.toContain('status')
    expect(url).toContain('filter%5Bname%5D=Newsletter')
  })

  test('post() sends a JSON-stringified body', async () => {
    const fetchSpy = mockFetchOnce(201, { status: 201, result: { _id: 'abc' } })
    await client.post('/campaigns', { name: 'Summer Sale' })

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ name: 'Summer Sale' }) })
    )
  })

  test('patch() uses the PATCH method', async () => {
    const fetchSpy = mockFetchOnce(200, { status: 200, result: {} })
    await client.patch('/campaigns/abc', { name: 'New name' })
    expect(fetchSpy.mock.calls[0][1].method).toBe('PATCH')
  })

  test('del() uses the DELETE method', async () => {
    const fetchSpy = mockFetchOnce(200, { status: 200, result: {} })
    await client.del('/campaigns/abc')
    expect(fetchSpy.mock.calls[0][1].method).toBe('DELETE')
  })

  test('throws BluefoxApiError on a non-2xx response, using the API error body', async () => {
    mockFetchOnce(404, { status: 404, error: { name: 'NOT_FOUND', message: 'Campaign not found.' } })

    try {
      await client.get('/campaigns/doesnotexist')
      expect.unreachable('expected client.get to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(BluefoxApiError)
      expect(err.message).toBe('Campaign not found.')
    }
  })

  test('throws BluefoxApiError even on a 200 that carries an error body', async () => {
    mockFetchOnce(200, { status: 400, error: { name: 'VALIDATION_ERROR', message: 'Missing required field: name' } })

    await expect(client.get('/campaigns')).rejects.toThrow('Missing required field: name')
  })

  test('handles a response body that fails to parse as JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json') }
    })

    await expect(client.get('/campaigns')).rejects.toThrow('Request failed with status 500')
  })

  test('getText() returns the raw response body instead of parsing it as JSON', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => 'type,name,value\nCNAME,a,b'
    })
    const result = await client.getText('/domains/dom1/export/csv')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.bluefox.email/v1/projectId/proj1/domains/dom1/export/csv',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer key1' }) })
    )
    expect(result).toBe('type,name,value\nCNAME,a,b')
  })

  test('postForm() posts a multipart body with the file and given fields, omitting undefined fields', async () => {
    const fetchSpy = mockFetchOnce(201, { status: 201, result: { _id: 'img1' } })

    const result = await client.postForm('/gallery/images', {
      fields: { name: 'logo.png', parentFolderId: undefined },
      file: { fieldName: 'image', buffer: Buffer.from('bytes'), filename: 'logo.png', contentType: 'image/png' }
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.bluefox.email/v1/projectId/proj1/gallery/images',
      expect.objectContaining({ method: 'POST', headers: { Authorization: 'Bearer key1' } })
    )
    const body = fetchSpy.mock.calls[0][1].body
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('name')).toBe('logo.png')
    expect(body.has('parentFolderId')).toBe(false)
    expect(body.get('image').name).toBe('logo.png')
    expect(result).toEqual({ _id: 'img1' })
  })

  test('postForm() throws BluefoxApiError on a non-2xx response', async () => {
    mockFetchOnce(400, { status: 400, error: { name: 'VALIDATION_ERROR', message: 'Invalid image.' } })

    await expect(client.postForm('/gallery/images', {
      fields: {},
      file: { fieldName: 'image', buffer: Buffer.from('bytes'), filename: 'logo.png', contentType: 'image/png' }
    })).rejects.toThrow('Invalid image.')
  })

  test('getText() throws BluefoxApiError on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ status: 404, error: { name: 'NOT_FOUND', message: 'Domain not found.' } })
    })

    await expect(client.getText('/domains/dom1/export/csv')).rejects.toThrow('Domain not found.')
  })
})
