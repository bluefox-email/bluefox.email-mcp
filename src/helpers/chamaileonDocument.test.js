import { describe, expect, test, vi, afterEach } from 'vitest'
import fs from 'fs/promises'
import { missingUnsubscribeWarning, readChamaileonDocument, resolveCreateContent, writeChamaileonDocument } from './chamaileonDocument.js'

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

  test('leaves design-system linked styles and unknown element types alone', async () => {
    const linkedStyle = { reference: 'Primary button', modified: false, value: {}, default: { color: '#ffffff' } }
    const written = { body: { children: [{ type: 'some-future-element', children: [{ type: 'button', style: linkedStyle }] }] } }

    const [loop] = (await readChamaileonDocument({ chamaileonJson: JSON.stringify(written) })).body.children

    expect(loop.attrs).toBeUndefined()
    expect(loop.style).toBeUndefined()
    expect(loop.customData).toEqual({})
    expect(loop.children[0].style).toEqual(linkedStyle)
    expect(loop.children[0].attrs).toMatchObject({ href: '' })
  })
})

describe('filling in the advanced Chamaileon elements', () => {
  async function fill (children) {
    return (await readChamaileonDocument({ chamaileonJson: JSON.stringify({ body: { children } }) })).body.children
  }

  test('fills typed-text, dynamic-image, video and code', async () => {
    const [typed, dynamic, video, code] = await fill([
      { type: 'typed-text', attrs: { text: 'Title' }, style: { subType: 'heading1', bold: true } },
      { type: 'dynamic-image', attrs: { src: '{{logoUrl}}' } },
      { type: 'video', attrs: { videoId: 'abc', videoProvider: 'youtube' } },
      { type: 'code', attrs: { content: '<b>Hi</b>' } }
    ])

    expect(typed).toMatchObject({ attrs: { text: 'Title' }, style: { subType: 'heading1', bold: true, italic: false, fontSize: '18px', paddingTop: '5px', lineSpacing: '0px' } })
    expect(dynamic).toMatchObject({ attrs: { src: '{{logoUrl}}', altText: '' }, style: { width: '150px', height: '150px', borderRadius: '0px', paddingTop: '0px' } })
    expect(video).toMatchObject({ attrs: { videoId: 'abc', thumbnailBaseUrl: 'https://video.chamaileon.io/thumbnail/generated/' }, style: { iconType: 'youtube', width: '600px' } })
    expect(code).toMatchObject({ attrs: { title: 'Your title', content: '<b>Hi</b>', isAmp: false }, style: {}, placeholder: {} })
  })

  test('fills loops, conditionals and branches at both levels, including their children', async () => {
    const [blockLoop, blockConditional] = await fill([
      { type: 'block-level-loop', attrs: { expression: 'news.item limit=5' }, children: [{ type: 'fullwidth', children: [{ type: 'loop', attrs: { expression: 'this.tags' }, children: [{ type: 'text' }] }] }] },
      { type: 'block-level-conditional', children: [{ type: 'branch', attrs: { expression: 'isPro' }, children: [{ type: 'fullwidth', children: [{ type: 'conditional', children: [{ type: 'branch', attrs: { type: 'else' } }] }] }] }] }
    ])

    expect(blockLoop).toMatchObject({ attrs: { lock: false, expression: 'news.item limit=5' }, style: {} })
    const [loop] = blockLoop.children[0].children
    expect(loop).toMatchObject({ attrs: { expression: 'this.tags' }, style: {} })
    expect(loop.children[0].style.paragraphFontSize).toBe('18px')

    expect(blockConditional).toMatchObject({ attrs: { lock: false }, style: {} })
    const [branch] = blockConditional.children
    expect(branch.attrs).toEqual({ expression: 'isPro', type: 'if' })
    const [conditional] = branch.children[0].children
    expect(conditional).toMatchObject({ attrs: {}, style: {} })
    expect(conditional.children[0].attrs.type).toBe('else')
  })

  test('works out each social icon from its network, icon set and color', async () => {
    const [defaults, custom] = await fill([
      { type: 'social', attrs: { elements: [{ type: 'Twitter', link: 'https://x.com/a' }, { type: 'Pinterest', link: 'https://pinterest.com/a' }] } },
      { type: 'social', attrs: { iconSet: 5, color: 'grey', elements: [{ type: 'TikTok', link: 'https://tiktok.com/@a' }, { type: 'Facebook', src: 'img/my-own.png' }, { type: 'Myspace', link: 'https://myspace.com/a' }] } }
    ])

    expect(defaults.attrs.elements).toEqual([
      { type: 'Twitter', link: 'https://x.com/a', src: 'img/Twitter/tw-3-colorful.png' },
      { type: 'Pinterest', link: 'https://pinterest.com/a', src: 'img/Pinterest/PT-3-colorful.png' }
    ])
    expect(custom.attrs.elements).toEqual([
      { type: 'TikTok', link: 'https://tiktok.com/@a', src: 'img/TikTok/tt-5-grey.png' },
      { type: 'Facebook', src: 'img/my-own.png' },
      { type: 'Myspace', link: 'https://myspace.com/a' }
    ])
  })
})

describe('merge tag quotes', () => {
  test('changes double quotes to single quotes inside merge tags, in links, images and text', async () => {
    const written = {
      body: {
        children: [{
          type: 'fullwidth',
          children: [
            { type: 'dynamic-image', attrs: { src: '{{DEFAULT contact.avatar "https://a.com/d.png"}}', link: '{{DEFAULT contact.url "https://a.com"}}' } },
            { type: 'button', attrs: { href: '{{DEFAULT contact.url "https://a.com"}}' } },
            { type: 'text', attrs: { text: '<p style="color:red"><a href="{{DEFAULT contact.url "https://a.com"}}">Hi {{DEFAULT contact.name "there"}}</a></p>' } }
          ]
        }]
      }
    }

    const [image, button, text] = (await readChamaileonDocument({ chamaileonJson: JSON.stringify(written) })).body.children[0].children

    expect(image.attrs).toMatchObject({ src: "{{DEFAULT contact.avatar 'https://a.com/d.png'}}", link: "{{DEFAULT contact.url 'https://a.com'}}" })
    expect(button.attrs.href).toBe("{{DEFAULT contact.url 'https://a.com'}}")
    expect(text.attrs.text).toBe('<p style="color:red"><a href="{{DEFAULT contact.url \'https://a.com\'}}">Hi {{DEFAULT contact.name \'there\'}}</a></p>')
  })

  test('leaves a tag that already has an apostrophe, and design system variable references, alone', async () => {
    const reference = { reference: 'logo', default: 'https://a.com/l.png' }
    const written = {
      body: {
        children: [{
          type: 'fullwidth',
          children: [
            { type: 'text', attrs: { text: '<p>{{DEFAULT contact.name "it\'s you"}}</p>' } },
            { type: 'image', attrs: { src: reference } }
          ]
        }]
      }
    }

    const [text, image] = (await readChamaileonDocument({ chamaileonJson: JSON.stringify(written) })).body.children[0].children

    expect(text.attrs.text).toBe('<p>{{DEFAULT contact.name "it\'s you"}}</p>')
    expect(image.attrs.src).toEqual(reference)
  })
})

describe('missingUnsubscribeWarning', () => {
  test('warns when the design has no unsubscribe link', () => {
    expect(missingUnsubscribeWarning({ body: { children: [{ attrs: { text: '<p>Unsubscribe</p>' } }] } })).toContain('Warning: this design has no {{unsubscribeLink}}')
  })

  test('accepts the merge tag or a design system unsubscribe variable', () => {
    expect(missingUnsubscribeWarning({ body: { attrs: { text: '<a href="{{unsubscribeLink}}">Leave</a>' } } })).toBe('')
    expect(missingUnsubscribeWarning({ body: { attrs: { link: { reference: 'unsubscribe', default: '' } } } })).toBe('')
  })

  test('says nothing about html/text content or no content', () => {
    expect(missingUnsubscribeWarning('<p>Hi</p>')).toBe('')
    expect(missingUnsubscribeWarning(undefined)).toBe('')
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
