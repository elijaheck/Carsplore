export const STORAGE_KEY = 'carsplore.local-deal.v1'
export const STORAGE_CLEARED_KEY = 'carsplore.local-deal.cleared.v1'

export function loadLocalState<T>(fallback: T): T {
  if (typeof window === 'undefined') return fallback

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved ? (JSON.parse(saved) as T) : fallback
  } catch {
    return fallback
  }
}

export function saveLocalState<T>(value: T): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  window.localStorage.removeItem(STORAGE_CLEARED_KEY)
}

export function clearLocalState(): void {
  window.localStorage.removeItem(STORAGE_KEY)
  window.localStorage.setItem(STORAGE_CLEARED_KEY, 'true')
}

export function wasLocalStateCleared(): boolean {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(STORAGE_CLEARED_KEY) === 'true'
  } catch {
    return false
  }
}
