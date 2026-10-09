import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLocalState,
  loadLocalState,
  saveLocalState,
  STORAGE_CLEARED_KEY,
  STORAGE_KEY,
  wasLocalStateCleared,
} from './storage'

function localStorageStub() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('local clear sentinel', () => {
  it('survives a reload-style read until fixture or edited state is saved', () => {
    const localStorage = localStorageStub()
    vi.stubGlobal('window', { localStorage })

    saveLocalState({ fixture: true })
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    clearLocalState()
    expect(loadLocalState(null)).toBeNull()
    expect(localStorage.getItem(STORAGE_CLEARED_KEY)).toBe('true')
    expect(wasLocalStateCleared()).toBe(true)

    saveLocalState({ fixture: true })
    expect(wasLocalStateCleared()).toBe(false)
  })
})
