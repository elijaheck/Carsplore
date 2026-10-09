import type { SellerDraftStep } from './domain/types'

/**
 * Any edit to facts, economics, or draft copy makes earlier message reviews
 * stale. Return fresh pending approval metadata without mutating the drafts.
 */
export function invalidateDraftApprovals<T extends SellerDraftStep>(drafts: readonly T[]): T[] {
  return drafts.map((draft) => ({
    ...draft,
    approval: { required: true, status: 'pending' },
  }))
}

export function hasDollarAmountAbove(text: string, maxAmount: number): boolean {
  if (!Number.isFinite(maxAmount)) return true
  const dollarAmounts = [...text.matchAll(/\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/g)]
  const offerAmounts = [...text.matchAll(/\b(?:offer|pay|prepare|price|take)\b[^0-9$]{0,24}\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi)]
  const amounts = [...dollarAmounts, ...offerAmounts]
    .map((match) => Number(match[1].replace(/,/g, '')))
    .filter(Number.isFinite)
  return amounts.some((amount) => amount > maxAmount)
}

export function isCanonicalOfferDraft(text: string, canonicalText: string): boolean {
  return text === canonicalText
}
