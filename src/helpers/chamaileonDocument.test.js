import { describe, expect, test, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import { readChamaileonDocument, resolveCreateContent } from './chamaileonDocument.js'

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn() }
}))

const doc = { body: { children: [] } }

afterEach(() => {
  vi.clearAllMocks()
})

describe('readChamaileonDocument', () => {
  test('returns undefined when no Chamaileon JSON was given', async () => {
    expect(await readChamaileonDocument({ body: 'Hello' })).toBeUndefined()
  })

  test('parses inline chamaileonJson', async () => {
    expect(await readChamaileonDocument({ chamaileonJson: JSON.stringify(doc) })).toEqual(doc)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  test('unwraps the document from a whole copied email record', async () => {
    const record = { _id: 'email1', subject: 'Hi', type: 'chamaileon', document: { title: 'Newsletter', ...doc } }

    expect(await readChamaileonDocument({ chamaileonJson: JSON.stringify(record) })).toEqual({ title: 'Newsletter', ...doc })
  })

  test('rejects a record whose document has no body', async () => {
    await expect(readChamaileonDocument({ chamaileonJson: '{"_id":"email1","document":{}}' })).rejects.toThrow('is not a Chamaileon document')
  })

  test('reads and parses a local chamaileonJsonPath', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify(doc))

    expect(await readChamaileonDocument({ chamaileonJsonPath: '/Users/me/email.json' })).toEqual(doc)
    expect(fs.readFile).toHaveBeenCalledWith('/Users/me/email.json', 'utf8')
  })

  test('reports an unreadable chamaileonJsonPath', async () => {
    fs.readFile.mockRejectedValue(new Error('ENOENT: no such file'))

    await expect(readChamaileonDocument({ chamaileonJsonPath: '/missing.json' }))
      .rejects.toThrow('Could not read chamaileonJsonPath: ENOENT: no such file')
  })

  test('rejects both sources at once', async () => {
    await expect(readChamaileonDocument({ chamaileonJson: '{}', chamaileonJsonPath: '/a.json' }))
      .rejects.toThrow('Provide either a Chamaileon JSON (chamaileonJsonPath or chamaileonJson, not both) or an html/text body/bodyType - not a mix.')
  })

  test('rejects a Chamaileon JSON mixed with an html/text body or bodyType', async () => {
    await expect(readChamaileonDocument({ chamaileonJson: '{}', body: 'Hello' })).rejects.toThrow('not a mix')
    await expect(readChamaileonDocument({ chamaileonJson: '{}', bodyType: 'html' })).rejects.toThrow('not a mix')
  })

  test('rejects invalid JSON', async () => {
    await expect(readChamaileonDocument({ chamaileonJson: '{not json' }))
      .rejects.toThrow('chamaileonJson is not valid JSON:')
  })

  test('rejects JSON that is not a Chamaileon document', async () => {
    fs.readFile.mockResolvedValue('[]')
    await expect(readChamaileonDocument({ chamaileonJsonPath: '/a.json' }))
      .rejects.toThrow('chamaileonJsonPath is not a Chamaileon document - expected a JSON object with a top-level "body" object, or a whole email/template record with one under "document".')
    await expect(readChamaileonDocument({ chamaileonJson: 'null' })).rejects.toThrow('is not a Chamaileon document')
    await expect(readChamaileonDocument({ chamaileonJson: '{"body":"x"}' })).rejects.toThrow('is not a Chamaileon document')
  })
})

describe('resolveCreateContent', () => {
  test('uses the Chamaileon JSON without a type, so the API defaults to the visual editor', async () => {
    expect(await resolveCreateContent({ chamaileonJson: JSON.stringify(doc) })).toEqual({ document: doc })
  })

  test('falls back to the html/text body, defaulting bodyType to text', async () => {
    expect(await resolveCreateContent({ body: 'Hello' })).toEqual({ type: 'text', document: 'Hello' })
    expect(await resolveCreateContent({ body: '<p>Hi</p>', bodyType: 'html' })).toEqual({ type: 'html', document: '<p>Hi</p>' })
  })

  test('requires some content', async () => {
    await expect(resolveCreateContent({}))
      .rejects.toThrow('Provide the email content - either body (html/text) or a Chamaileon JSON (chamaileonJsonPath or chamaileonJson).')
  })
})
