import { BluefoxApiError } from './errors.js'

function buildQueryString (query) {
  if (!query) {
    return ''
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue
    }
    if (key === 'filter' && value && typeof value === 'object') {
      for (const [filterKey, filterValue] of Object.entries(value)) {
        if (filterValue !== undefined) {
          params.set(`filter[${filterKey}]`, filterValue)
        }
      }
      continue
    }
    params.set(key, value)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

// Thin wrapper around fetch, the only place that builds bluefox.email URLs and attaches auth.
export function createBluefoxClient ({ baseUrl, projectId, apiKey }) {
  async function parseJsonResult (res) {
    const json = await res.json().catch(() => null)
    if (!res.ok || json?.error) {
      throw new BluefoxApiError(res.status, json?.error)
    }
    return json?.result
  }

  async function request (method, path, { query, body } = {}) {
    const url = `${baseUrl}/v1/projectId/${projectId}${path}${buildQueryString(query)}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    return parseJsonResult(res)
  }

  async function requestForm (path, { fields = {}, file }) {
    const url = `${baseUrl}/v1/projectId/${projectId}${path}`
    const form = new FormData()
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        form.append(key, value)
      }
    }
    form.append(file.fieldName, new Blob([file.buffer], { type: file.contentType }), file.filename)

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    })
    return parseJsonResult(res)
  }

  // A handful of export-style endpoints (CSV downloads) respond with a raw file body, via
  // res.attachment()/res.end(), instead of the {status, result} JSON envelope every other route uses -
  // request() above would fail to parse that as JSON and silently return undefined, so this reads it as text.
  async function requestText (path, { query } = {}) {
    const url = `${baseUrl}/v1/projectId/${projectId}${path}${buildQueryString(query)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!res.ok) {
      const json = await res.json().catch(() => null)
      throw new BluefoxApiError(res.status, json?.error)
    }
    return res.text()
  }

  return {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    del: path => request('DELETE', path),
    getText: (path, query) => requestText(path, { query }),
    postForm: (path, opts) => requestForm(path, opts)
  }
}
