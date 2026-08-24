export class BluefoxApiError extends Error {
  constructor (status, error) {
    super(error?.message || `Request failed with status ${status}`)
    this.status = status
    this.name = error?.name || 'UNKNOWN_ERROR'
  }
}

// Thrown by resolveId.js when a *Name lookup fails locally (not found / ambiguous) - not an API error, but
// still a deliberate, already-plain-language message that should be relayed as-is, not wrapped further.
export class ResolveError extends Error {}

function humanize (err) {
  if (err.name === 'AUTHORIZATION_ERROR') {
    return 'Your bluefox.email project ID or API key looks wrong - double-check BLUEFOX_PROJECT_ID and BLUEFOX_API_KEY in this server\'s configuration.'
  }
  // VALIDATION_ERROR / NOT_FOUND / METHOD_NOT_ALLOWED_ERROR / CONFLICT_ERROR messages from the API are already
  // written in plain business language (e.g. "This email is already in the suppression list.") - relay as-is.
  return err.message
}

export function toToolResult (err) {
  let text
  if (err instanceof BluefoxApiError) {
    text = humanize(err)
  } else if (err instanceof ResolveError) {
    text = err.message
  } else {
    text = `Something went wrong talking to bluefox.email: ${err.message}`
  }
  return { content: [{ type: 'text', text }], isError: true }
}

export function textResult (text) {
  return { content: [{ type: 'text', text }] }
}
