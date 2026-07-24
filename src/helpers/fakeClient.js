import { vi } from 'vitest'

export function createFakeClient (overrides = {}) {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
    ...overrides
  }
}
