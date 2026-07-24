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

// Thin wrapper around fetch, the only place that builds bluefox.email URLs and attaches auth. Every resource in
// the public API lives under /v1/projectId/{projectId}{path}, so that's the only shape this client needs to build.
export function createBluefoxClient ({ baseUrl, projectId, apiKey }) {
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
    const json = await res.json().catch(() => null)
    if (!res.ok || json?.error) {
      throw new BluefoxApiError(res.status, json?.error)
    }
    return json?.result
  }

  return {
    get: (path, query) => request('GET', path, { query }),
    post: (path, body) => request('POST', path, { body }),
    patch: (path, body) => request('PATCH', path, { body }),
    del: path => request('DELETE', path)
  }
}
