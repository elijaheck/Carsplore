import { describe, expect, it } from 'vitest'
import { hasDollarAmountAbove, invalidateDraftApprovals, isCanonicalOfferDraft } from './approvals'
import type { SellerDraftStep } from './domain/types'

describe('draft approval invalidation', () => {
  it('returns every prior draft decision to pending without mutating the input', () => {
    const drafts: SellerDraftStep[] = [
      {
        key: 'availability',
        label: 'Availability',
        objective: 'Confirm availability.',
        prompt: 'Still available?',
        requiredFields: ['availability'],
        approval: {
          required: true,
          status: 'approved',
          approvedBy: 'local operator',
          approvedAt: '2026-08-17T12:00:00Z',
          note: 'Reviewed before the edit.',
        },
      },
      {
        key: 'condition-title',
        label: 'Condition + title',
        objective: 'Confirm facts.',
        prompt: 'Any issues?',
        requiredFields: ['titleStatus'],
        approval: { required: true, status: 'rejected', note: 'Old copy.' },
      },
    ]
    const before = structuredClone(drafts)

    const invalidated = invalidateDraftApprovals(drafts)

    expect(invalidated.map((draft) => draft.approval)).toEqual([
      { required: true, status: 'pending' },
      { required: true, status: 'pending' },
    ])
    expect(drafts).toEqual(before)
  })
})

describe('offer draft amount guard', () => {
  it('detects formatted dollar amounts above the structured maximum buy', () => {
    expect(hasDollarAmountAbove('I can offer $1,500 after inspection.', 1_500)).toBe(false)
    expect(hasDollarAmountAbove('I can offer $1,800 after inspection.', 1_500)).toBe(true)
    expect(hasDollarAmountAbove('Offer $1500; never exceed $1,500.', 1_500)).toBe(false)
    expect(hasDollarAmountAbove('Offer 1,800 after inspection.', 1_500)).toBe(true)
    expect(hasDollarAmountAbove('I can pay 1800 today.', 1_500)).toBe(true)
  })

  it('requires the offer draft to match the current canonical generated copy', () => {
    const canonical = 'I can prepare $1,500 for review; I will not exceed $1,500.'
    expect(isCanonicalOfferDraft(canonical, canonical)).toBe(true)
    expect(isCanonicalOfferDraft(` ${canonical}`, canonical)).toBe(false)
    expect(isCanonicalOfferDraft(`${canonical}\n`, canonical)).toBe(false)
    expect(isCanonicalOfferDraft('I can do 1800 today.', canonical)).toBe(false)
    expect(isCanonicalOfferDraft('1800 cash today.', canonical)).toBe(false)
  })
})
