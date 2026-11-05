import crypto from 'crypto'
import fs from 'fs/promises'
import { z } from 'zod'
import { ResolveError } from './errors.js'

export const chamaileonInputSchema = {
  chamaileonJsonPath: z.string().optional().describe('A path to a Chamaileon (visual editor) JSON file on this machine, e.g. one you wrote (see chamaileonJson for the format), exported from Chamaileon, or a whole copied bluefox.email email/template record (its "document" is used, the other fields are ignored) - uploaded as the visual editor document, editable in the app\'s drag-and-drop editor. Pass the path directly, do not read the file yourself. Use instead of body.'),
  chamaileonJson: z.string().optional().describe('The same Chamaileon JSON document as chamaileonJsonPath, given inline as a JSON string. Prefer chamaileonJsonPath for a file - only use this when the JSON is not saved anywhere. ' +
    'To design one yourself: {"body":{"style":{"backgroundColor":"#f4f4f4"},"children":[fullwidth elements]}}. A fullwidth element is {"type":"fullwidth","style":{"contentBackgroundColor":"#ffffff","contentPaddingTop":"20px",...},"children":[elements]} (600px wide). ' +
    'Elements inside it: {"type":"text","attrs":{"text":"<h1>..</h1><p style=\\"text-align: center;\\">..</p>"},"style":{"paragraphFontFamily":"Verdana, Geneva, sans-serif","paragraphColor":"#333333","paragraphFontSize":"16px","linkColor":"#0094c5","h1FontFamily":"Georgia, serif","h1Color":"#111111"}} ' +
    '(also h2/h3 FontFamily, Color, FontSize - set link colors here, an inline color on <a> is overridden), ' +
    '{"type":"button","attrs":{"text":"<p>Shop</p>","href":"https://.."},"style":{"backgroundColor":"#0094c5"}}, ' +
    '{"type":"image","attrs":{"src":"https://..","altText":"..","link":""},"style":{"width":"560px","maxWidth":"560px"}}, {"type":"divider"}, ' +
    '{"type":"social","attrs":{"elements":[{"type":"Facebook","link":"https://.."}],"color":"colorful","iconSet":3}} (networks: Blogger, Facebook, Instagram, Linkedin, Medium, Pinterest, Snapchat, SoundCloud, Spotify, Telegram, TikTok, Tumblr, Twitter, Vimeo, Vkontakte, WeChat, YouTube; color colorful, black, grey or white; iconSet 1-5; the icon src is filled in for you), ' +
    '{"type":"box","style":{"backgroundColor":"..","paddingTop":"16px","borderRadius":"8px"},"children":[elements]}, ' +
    'columns {"type":"multicolumn","children":[{"type":"column","style":{"width":"280px"},"children":[elements]}, ...]} (widths add up to the space available), ' +
    '{"type":"typed-text","attrs":{"text":"Plain text"},"style":{"subType":"heading1","fontSize":"32px","color":"#111111","fontFamily":"Georgia, serif","align":"center","bold":true}} (subType paragraph, heading1-3 or list; takes plain text and its own style, while text takes HTML), ' +
    '{"type":"code","attrs":{"title":"Custom HTML","content":"<div style=\\"font-size:16px\\">..</div>"}} (raw HTML, it must set its own font-size), {"type":"dynamic-image","attrs":{"src":"{{this.image.url}}","altText":".."},"style":{"width":"150px","height":"150px"}} (image URL from a merge tag), ' +
    '{"type":"video","attrs":{"videoId":"..","videoProvider":"youtube","link":"https://.."}} (thumbnail generated from the videoId; not in the app editor\'s toolbox). ' +
    'Personalization: {"type":"loop","attrs":{"expression":"news.item limit=5 skip=0"},"children":[elements]} repeats its children per feed item (use {{this.title}} inside; add the feed with the feeds param), and {"type":"conditional","children":[{"type":"branch","attrs":{"type":"if","expression":"(EQ contact.plan \\"pro\\")"},"children":[elements]},{"type":"branch","attrs":{"type":"else"},"children":[elements]}]} (branch type if, else-if or else). block-level-loop and block-level-conditional work the same but sit directly in body and wrap whole fullwidth elements. ' +
    'Nesting: body holds only fullwidth and block-level-*; fullwidth, box, column, loop and branch hold elements; multicolumn holds only column; conditional holds only branch. ' +
    'Colors, fonts and images can use a design system variable, e.g. "color":{"reference":"name","default":"#111111"} (see manage_design_system). ' +
    'Style values are CSS strings with px units; any eid and style/attrs key left out gets the editor\'s default, so only set what you want to change. Merge tags like {{contact.name}} and {{unsubscribeLink}} work in text and links.')
}

function isObject (value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function background (prefix = 'background', color = '') {
  return { [`${prefix}Color`]: color, [`${prefix}Repeat`]: 'no-repeat', [`${prefix}Position`]: 'center center', [`${prefix}Image`]: '', [`${prefix}Size`]: 'auto' }
}

function boxModel (prefix = '', padding = '0px', margin = '0px') {
  const key = name => prefix ? `${prefix}${name}` : name[0].toLowerCase() + name.slice(1)
  const style = { [key('BorderRadius')]: '0px' }
  for (const side of ['Left', 'Bottom', 'Right', 'Top']) {
    Object.assign(style, { [key(`Border${side}Color`)]: '#121212', [key(`Border${side}Style`)]: 'solid', [key(`Border${side}Width`)]: '0px', [key(`Margin${side}`)]: margin, [key(`Padding${side}`)]: padding })
  }
  return style
}

const HIDE = { hideOnMobile: false, hideOnDesktop: false, hideInAmp: false }

// What the Chamaileon editor itself writes for a new element - merged under whatever the given JSON sets, so an
// agent can write just the keys it cares about (type, children, attrs.text, ...) and still get a complete document.
const BLOCK_DEFAULTS = {
  body: { attrs: {}, style: { ...background(), backgroundColor: '#FFFFFF', bodyWidth: 600 }, version: '4.1.0' },
  fullwidth: { attrs: { ...HIDE, lock: false, marker: '' }, style: { ...background(), ...background('contentBackground'), ...boxModel('content'), contentWidth: 600, bodyWidth: 600 }, placeholder: [] },
  box: { attrs: HIDE, style: { ...background(), ...boxModel() } },
  multicolumn: { attrs: { ...HIDE, stacking: 'left-on-top', spacerBefore: '0px', spacerBetween: '0px', spacerAfter: '0px', spacerBeforeMobile: '0px', spacerBetweenMobile: '0px', spacerAfterMobile: '0px' }, style: background() },
  column: { attrs: { hideOnMobile: false, lock: false }, style: background() },
  text: {
    attrs: { text: '' },
    style: {
      ...background(),
      paddingLeft: '10px',
      paddingBottom: '5px',
      paddingRight: '10px',
      paddingTop: '5px',
      paragraphLineHeight: '25px',
      paragraphLetterSpacing: 'normal',
      paragraphColor: '#131313',
      paragraphFontSize: '18px',
      paragraphFontFamily: 'Arial, Helvetica Neue, Helvetica, sans-serif',
      linkTextDecoration: 'underline',
      linkColor: '#00c0e7',
      ...Object.fromEntries([['h1', '33px', '40px'], ['h2', '26px', '34px'], ['h3', '22px', '27px']].flatMap(([h, size, lineHeight]) => [
        [`${h}LineHeight`, lineHeight], [`${h}Color`, '#131313'], [`${h}FontSize`, size], [`${h}FontFamily`, 'Georgia, Times, Times New Roman, serif'], [`${h}LetterSpacing`, 'normal']
      ]))
    }
  },
  button: {
    attrs: { title: '', text: '', href: '' },
    style: { lineHeight: '25px', color: '#ffffff', fontSize: '18px', fontFamily: 'Arial, Helvetica Neue, Helvetica, sans-serif', letterSpacing: 'normal', ...background(), backgroundColor: '#0094c5', ...boxModel('', '15px', '20px'), borderRadius: '5px', hoverBackgroundColor: '', sizeType: 'FIT_TO_TEXT', fullWidthOnMobile: true, align: 'center' }
  },
  image: {
    attrs: { title: '', link: '', altText: '', src: '' },
    style: { fullWidthOnMobile: false, align: 'center', lockedWidth: null, lockedHeight: null, maxHeight: '', maxWidth: '600px', width: '600px', ...background(), ...boxModel() }
  },
  divider: {
    attrs: {},
    style: { width: '1px', type: 'solid', color: '#a9a9a9', align: 'center', ...background(), paddingTop: '10px', paddingRight: '10px', paddingBottom: '10px', paddingLeft: '10px' }
  },
  social: {
    attrs: { elements: [], align: 'center', color: 'colorful', iconSet: 3, size: 32, layout: 'horizontal', spacing: 10, ...HIDE, reorderOnMobile: false, baseUrl: 'https://cdn.chamaileon.io/assets/' },
    style: {}
  },
  'typed-text': {
    attrs: { text: '' },
    style: { subType: 'paragraph', ...background(), paddingLeft: '10px', paddingBottom: '5px', paddingRight: '10px', paddingTop: '5px', lineHeight: '25px', letterSpacing: 'normal', color: '#131313', fontSize: '18px', fontFamily: 'Arial, Helvetica Neue, Helvetica, sans-serif', linkTextDecoration: 'underline', linkColor: '#00c0e7', listMarkerType: 'disc', listMarkerFontSize: '18px', listMarkerColor: '#131313', listMarkerFontFamily: 'Arial, Helvetica Neue, Helvetica, sans-serif', lineSpacing: '0px', align: 'left', bold: false, italic: false, underline: false }
  },
  'dynamic-image': {
    attrs: { title: '', link: '', altText: '', src: '' },
    style: { align: 'center', fullWidthOnMobile: false, maxHeight: '300px', maxWidth: '300px', width: '150px', height: '150px', ...background(), ...boxModel() }
  },
  video: {
    attrs: { link: '', altText: '', videoId: '', videoProvider: '', previewBaseUrl: 'https://video.chamaileon.io/thumbnail/original/', thumbnailBaseUrl: 'https://video.chamaileon.io/thumbnail/generated/', src: '' },
    style: { align: 'center', iconColor: '#FF0000', iconSize: '50px', iconType: 'youtube', lockedWidth: null, lockedHeight: null, maxHeight: '338px', maxWidth: '600px', width: '600px', ...background(), ...boxModel() }
  },
  code: { attrs: { title: 'Your title', content: '', style: '', isAmp: false }, style: {}, placeholder: {} },
  loop: { attrs: { expression: 'dummy_expression' }, style: {} },
  conditional: { attrs: {}, style: {} },
  branch: { attrs: { expression: 'dummy_expression', type: 'if' }, style: {} },
  'block-level-loop': { attrs: { lock: false, expression: 'dummy_expression' }, style: {} },
  'block-level-conditional': { attrs: { lock: false }, style: {} }
}

const SOCIAL_ICON_PREFIXES = { Blogger: 'BL', Facebook: 'fb', Instagram: 'ig', Linkedin: 'li', Medium: 'ME', Pinterest: 'PT', Snapchat: 'SN', SoundCloud: 'SC', Spotify: 'SP', Telegram: 'TG', TikTok: 'tt', Tumblr: 'TU', Twitter: 'tw', Vimeo: 'VI', Vkontakte: 'VK', WeChat: 'WC', YouTube: 'YT' }

// The icon file depends on the network, icon set and color - an element that gives its own src keeps it
function fillSocialIcons (attrs) {
  const elements = attrs.elements.map(element => {
    const prefix = SOCIAL_ICON_PREFIXES[element.type]
    return prefix ? { src: `img/${element.type}/${prefix}-${attrs.iconSet}-${attrs.color}.png`, ...element } : element
  })
  return { ...attrs, elements }
}

function fillBlockDefaults (block) {
  const defaults = BLOCK_DEFAULTS[block.type]
  const filled = { eid: crypto.randomBytes(8).toString('base64url').slice(0, 10), customData: {}, ...defaults, ...block }
  if (defaults) {
    filled.attrs = { ...defaults.attrs, ...block.attrs }
    // a style linked to a design system component ({ reference, default, ... }) is kept as-is
    if (!block.style?.reference) {
      filled.style = { ...defaults.style, ...block.style }
    }
  }
  if (block.type === 'social') {
    filled.attrs = fillSocialIcons(filled.attrs)
  }
  if (Array.isArray(block.children)) {
    filled.children = block.children.map(fillBlockDefaults)
  }
  return filled
}

function fillDocumentDefaults (document) {
  return { variables: [], fontFiles: {}, fontStacks: null, ...document, body: fillBlockDefaults({ eid: 'root', type: 'body', ...document.body }) }
}

// Reads chamaileonJsonPath / chamaileonJson into the parsed visual editor document, or undefined
// when neither was given - so the caller falls back to its plain html/text body.
export async function readChamaileonDocument (args) {
  const sources = ['chamaileonJsonPath', 'chamaileonJson'].filter(key => args[key])
  if (sources.length === 0) {
    return undefined
  }
  if (sources.length > 1 || args.body !== undefined || args.bodyType) {
    throw new ResolveError('Provide either a Chamaileon JSON (chamaileonJsonPath or chamaileonJson, not both) or an html/text body/bodyType - not a mix.')
  }

  const source = sources[0]
  let raw = args.chamaileonJson
  if (source === 'chamaileonJsonPath') {
    try {
      raw = await fs.readFile(args.chamaileonJsonPath, 'utf8')
    } catch (err) {
      throw new ResolveError(`Could not read chamaileonJsonPath: ${err.message}`)
    }
  }

  let document
  try {
    document = JSON.parse(raw)
  } catch (err) {
    throw new ResolveError(`${source} is not valid JSON: ${err.message}`)
  }
  // a whole copied email/template record (with _id, subject, type...) carries the design under "document"
  if (isObject(document) && isObject(document.document)) {
    document = document.document
  }
  if (!isObject(document) || !isObject(document.body)) {
    throw new ResolveError(`${source} is not a Chamaileon document - expected a JSON object with a top-level "body" object, or a whole email/template record with one under "document".`)
  }
  return fillDocumentDefaults(document)
}

// The type/document pair for creating an email: the Chamaileon JSON when given (type left out - the
// API defaults new emails to the visual editor), otherwise the html/text body.
export async function resolveCreateContent (args) {
  const document = await readChamaileonDocument(args)
  if (document) {
    return { document }
  }
  if (args.body === undefined) {
    throw new ResolveError('Provide the email content - either body (html/text) or a Chamaileon JSON (chamaileonJsonPath or chamaileonJson).')
  }
  return { type: args.bodyType || 'text', document: args.body }
}

export const chamaileonOutputSchema = {
  chamaileonJsonOutputPath: z.string().optional().describe('Saves the visual editor (Chamaileon) JSON document to this file path on this machine - to edit it and upload it again as chamaileonJsonPath. Does not work for html/text content.')
}

// Writes a fetched email/template's visual editor document to chamaileonJsonOutputPath, returning the line to
// add to the tool's answer ('' when no path was asked for).
export async function writeChamaileonDocument (document, outputPath) {
  if (!outputPath) {
    return ''
  }
  if (!isObject(document)) {
    throw new ResolveError('This content is html/text, not a visual editor (Chamaileon) document - there is no Chamaileon JSON to save.')
  }
  await fs.writeFile(outputPath, JSON.stringify(document, null, 2))
  return `\nSaved the Chamaileon JSON to: ${outputPath}`
}
