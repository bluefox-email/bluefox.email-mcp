import { describe, expect, test, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import { readChamaileonDocument, resolveCreateContent, writeChamaileonDocument } from './chamaileonDocument.js'

vi.mock('fs/promises', () => ({
  default: { readFile: vi.fn(), writeFile: vi.fn() }
}))

const doc = { body: { children: [] } }
// what doc becomes once the editor defaults are filled in
const filled = expect.objectContaining({ body: expect.objectContaining({ eid: 'root', type: 'body', children: [] }) })

afterEach(() => {
  vi.clearAllMocks()
})

describe('readChamaileonDocument', () => {
  test('returns undefined when no Chamaileon JSON was given', async () => {
    expect(await readChamaileonDocument({ body: 'Hello' })).toBeUndefined()
  })

  test('parses inline chamaileonJson', async () => {
    expect(await readChamaileonDocument({ chamaileonJson: JSON.stringify(doc) })).toEqual(filled)
    expect(fs.readFile).not.toHaveBeenCalled()
  })

  test('unwraps the document from a whole copied email record', async () => {
    const record = { _id: 'email1', subject: 'Hi', type: 'chamaileon', document: { title: 'Newsletter', ...doc } }

    expect(await readChamaileonDocument({ chamaileonJson: JSON.stringify(record) })).toEqual(expect.objectContaining({ title: 'Newsletter', body: expect.objectContaining({ eid: 'root', children: [] }) }))
  })

  test('rejects a record whose document has no body', async () => {
    await expect(readChamaileonDocument({ chamaileonJson: '{"_id":"email1","document":{}}' })).rejects.toThrow('is not a Chamaileon document')
  })

  test('reads and parses a local chamaileonJsonPath', async () => {
    fs.readFile.mockResolvedValue(JSON.stringify(doc))

    expect(await readChamaileonDocument({ chamaileonJsonPath: '/Users/me/email.json' })).toEqual(filled)
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

describe('filling in the editor defaults', () => {
  test('completes a hand-written document, keeping every value it sets', async () => {
    const written = {
      title: 'Autumn',
      body: {
        style: { backgroundColor: '#f4f4f4' },
        children: [{
          type: 'fullwidth',
          style: { contentPaddingTop: '24px' },
          children: [
            { type: 'text', attrs: { text: '<p>Hi</p>' } },
            { type: 'button', eid: 'keepMyEid1', attrs: { text: '<p>Shop</p>', href: 'https://example.com' }, style: { backgroundColor: '#ff6a00' } },
            { type: 'multicolumn', children: [{ type: 'column', style: { width: '280px' }, children: [{ type: 'divider' }] }] }
          ]
        }]
      }
    }

    const document = await readChamaileonDocument({ chamaileonJson: JSON.stringify(written) })

    expect(document).toMatchObject({ title: 'Autumn', variables: [], fontFiles: {}, fontStacks: null })
    expect(document.body).toMatchObject({ eid: 'root', type: 'body', version: '4.1.0', customData: {}, style: { backgroundColor: '#f4f4f4', bodyWidth: 600 } })
    const [section] = document.body.children
    expect(section).toMatchObject({ type: 'fullwidth', placeholder: [], attrs: { lock: false }, style: { contentPaddingTop: '24px', contentPaddingLeft: '0px', contentBorderTopColor: '#121212', contentBackgroundColor: '', contentWidth: 600 } })
    expect(section.eid).toMatch(/^[\w-]{10}$/)
    const [text, button, columns] = section.children
    expect(text).toMatchObject({ attrs: { text: '<p>Hi</p>' }, style: { paragraphFontSize: '18px', h1FontSize: '33px', paddingTop: '5px' } })
    expect(button).toMatchObject({ eid: 'keepMyEid1', attrs: { title: '', href: 'https://example.com' }, style: { backgroundColor: '#ff6a00', borderRadius: '5px', marginTop: '20px', paddingTop: '15px', sizeType: 'FIT_TO_TEXT' } })
    expect(columns).toMatchObject({ attrs: { stacking: 'left-on-top' }, children: [{ type: 'column', style: { width: '280px', backgroundColor: '' }, children: [{ type: 'divider', style: { color: '#a9a9a9' } }] }] })
  })

  test('fills images, boxes and social icons', async () => {
    const written = { body: { children: [{ type: 'box', children: [{ type: 'image', attrs: { src: 'https://example.com/a.png' } }, { type: 'social', attrs: { elements: [] } }] }] } }

    const [box] = (await readChamaileonDocument({ chamaileonJson: JSON.stringify(written) })).body.children

    expect(box).toMatchObject({ attrs: { hideInAmp: false }, style: { paddingTop: '0px', borderRadius: '0px' } })
    expect(box.children).toMatchObject([
      { attrs: { src: 'https://example.com/a.png', altText: '' }, style: { width: '600px', maxWidth: '600px' } },
      { attrs: { iconSet: 3, baseUrl: 'https://cdn.chamaileon.io/assets/' }, style: {} }
    ])
  })

  test('leaves design-system linked styles and unknown block types alone', async () => {
    const linkedStyle = { reference: 'Primary button', modified: false, value: {}, default: { color: '#ffffff' } }
    const written = { body: { children: [{ type: 'block-level-loop', children: [{ type: 'button', style: linkedStyle }] }] } }

    const [loop] = (await readChamaileonDocument({ chamaileonJson: JSON.stringify(written) })).body.children

    expect(loop.attrs).toBeUndefined()
    expect(loop.style).toBeUndefined()
    expect(loop.customData).toEqual({})
    expect(loop.children[0].style).toEqual(linkedStyle)
    expect(loop.children[0].attrs).toMatchObject({ href: '' })
  })
})

describe('resolveCreateContent', () => {
  test('uses the Chamaileon JSON without a type, so the API defaults to the visual editor', async () => {
    expect(await resolveCreateContent({ chamaileonJson: JSON.stringify(doc) })).toEqual({ document: filled })
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

describe('writeChamaileonDocument', () => {
  test('does nothing when no chamaileonJsonOutputPath was given', async () => {
    expect(await writeChamaileonDocument(doc, undefined)).toBe('')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })

  test('saves the visual editor document as formatted JSON', async () => {
    expect(await writeChamaileonDocument(doc, '/Users/me/email.json')).toBe('\nSaved the Chamaileon JSON to: /Users/me/email.json')
    expect(fs.writeFile).toHaveBeenCalledWith('/Users/me/email.json', JSON.stringify(doc, null, 2))
  })

  test('rejects html/text content', async () => {
    await expect(writeChamaileonDocument('<p>Hi</p>', '/Users/me/email.json'))
      .rejects.toThrow('This content is html/text, not a visual editor (Chamaileon) document - there is no Chamaileon JSON to save.')
    expect(fs.writeFile).not.toHaveBeenCalled()
  })
})
