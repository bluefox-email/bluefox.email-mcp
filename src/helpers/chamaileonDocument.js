import fs from 'fs/promises'
import { z } from 'zod'
import { ResolveError } from './errors.js'

export const chamaileonInputSchema = {
  chamaileonJsonPath: z.string().optional().describe('A path to a Chamaileon (visual editor) JSON file on this machine, e.g. one exported from Chamaileon, or a whole copied bluefox.email email/template record (its "document" is used, the other fields are ignored) - uploaded as the visual editor document, editable in the app\'s drag-and-drop editor. Pass the path directly, do not read the file yourself. Use instead of body.'),
  chamaileonJson: z.string().optional().describe('The same Chamaileon JSON document as chamaileonJsonPath, given inline as a JSON string. Prefer chamaileonJsonPath for a file - only use this when the JSON is not saved anywhere.')
}

function isObject (value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
  return document
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
