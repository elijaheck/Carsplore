import { describe, expect, it } from 'vitest'
import {
  createSellerDraftSequence,
  calculateUnderwriting,
  sellerDraftSequence,
} from './valuation'
import {
  mazda6Fixture,
  mazda6FixtureAlternateUnderwriting,
  mazda6FixtureUnderwriting,
} from './fixture'
import type { UnderwritingInput, Vehicle } from './types'

type RiskPatch = {
  history?: Partial<NonNullable<Vehicle['history']>>
  condition?: Partial<NonNullable<Vehicle['condition']>>
}

function vehicleWithRiskPatch(patch: RiskPatch): Vehicle {
  return {
    ...mazda6Fixture.vehicle,
    history: { ...mazda6Fixture.vehicle.history, ...patch.history },
    condition: { ...mazda6Fixture.vehicle.condition, ...patch.condition },
  }
}

describe('Carsplore deterministic valuation engine', () => {
  it('matches the locked Mazda 6 fixture retail, quick-sale, and max-buy economics', () => {
    expect(mazda6FixtureUnderwriting.expectedRetailRange).toEqual({
      low: 2_200,
      high: 2_500,
      midpoint: 2_350,
    })
    expect(mazda6FixtureUnderwriting.quickSale).toBe(2_350)
    expect(mazda6FixtureUnderwriting.maxBuy).toBe(1_500)
    expect(mazda6FixtureUnderwriting.approvedMaxBuy).toBe(1_500)
    expect(mazda6FixtureUnderwriting.economics.approvedMaxBuy).toBe(1_500)
    expect(mazda6FixtureUnderwriting.compCount).toBe(4)
    expect(mazda6FixtureUnderwriting.projectedProfitRange).toEqual({
      low: 350,
      high: 650,
      midpoint: 500,
    })
    expect(mazda6FixtureUnderwriting.decision).toBe('go')
    expect(mazda6FixtureUnderwriting.warnings).toEqual([])
  })

  it('shows the locked $1,800 offer as $50-$350 projected profit', () => {
    expect(mazda6FixtureAlternateUnderwriting.maxBuy).toBe(1_500)
    expect(mazda6FixtureAlternateUnderwriting.requestedProposedBuy).toBe(1_800)
    expect(mazda6FixtureAlternateUnderwriting.proposedBuy).toBe(1_500)
    expect(mazda6FixtureAlternateUnderwriting.decision).toBe('manual-review')
    expect(mazda6FixtureAlternateUnderwriting.approvedMaxBuy).toBeNull()
    expect(mazda6FixtureAlternateUnderwriting.economics.approvedMaxBuy).toBeNull()
    expect(mazda6FixtureAlternateUnderwriting.projectedProfitRange).toEqual({
      low: 50,
      high: 350,
      midpoint: 200,
    })
  })

  it('normalizes both mileage and days listed and explains each adjustment', () => {
    const input: UnderwritingInput = {
      vehicle: {
        year: 2007,
        make: 'Mazda',
        model: '6',
        mileage: 100_000,
        titleStatus: 'clean',
        titleInSellerName: true,
        history: {
          titleStatus: 'clean',
          titleInSellerName: true,
          structuralDamage: false,
          floodDamage: false,
          fireDamage: false,
          unresolvedAirbags: false,
          airbagsResolved: true,
          accidentSeverity: 'none',
        },
        condition: { drivability: 'clear' },
      },
      comps: [
        {
          id: 'high-mileage-slow-comp',
          mileage: 120_000,
          price: 2_000,
          daysListed: 60,
          status: 'sold',
          source: 'manual listing note',
          capturedAt: '2026-08-17',
        },
      ],
      costs: { recon: 0, targetProfit: 0 },
    }
    const result = calculateUnderwriting(input)
    const comp = result.normalizedComps[0]
    expect(comp.mileageAdjustment).toBe(400)
    expect(comp.daysListedAdjustment).toBe(-60)
    expect(comp.normalizedPrice).toBe(2_340)
    expect(result.adjustments.map((item) => item.category)).toEqual(['mileage', 'days-listed', 'status'])
    expect(comp.explanation).toContain('mileage')
    expect(comp.explanation).toContain('DOM')
  })

  it('keeps user-supplied KBB/MMR/CARFAX evidence source- and timestamp-visible', () => {
    const result = calculateUnderwriting({
      ...mazda6Fixture.underwriting,
      evidence: [
        { id: 'kbb', kind: 'kbb', source: 'KBB', capturedAt: '2026-08-17T10:00:00Z', value: 2_350 },
        { id: 'mmr', kind: 'mmr', source: 'MMR', capturedAt: '2026-08-17T10:01:00Z', value: 2_300 },
        { id: 'carfax', kind: 'carfax', source: 'CARFAX', capturedAt: '2026-08-17T10:02:00Z' },
      ],
    })
    expect(result.evidence).toEqual([
      expect.objectContaining({ id: 'kbb', source: 'KBB', capturedAt: '2026-08-17T10:00:00Z', status: 'timestamped' }),
      expect.objectContaining({ id: 'mmr', source: 'MMR', capturedAt: '2026-08-17T10:01:00Z', status: 'timestamped' }),
      expect.objectContaining({ id: 'carfax', source: 'CARFAX', capturedAt: '2026-08-17T10:02:00Z', status: 'timestamped' }),
    ])
    expect(result.warnings).not.toContain(expect.stringContaining('missing'))
  })

  it('requires manual review with a bounded adjustment for a minor repaired accident and clean title', () => {
    const vehicle: Vehicle = {
      ...mazda6Fixture.vehicle,
      history: {
        ...mazda6Fixture.vehicle.history,
        titleStatus: 'clean',
        titleInSellerName: true,
        minorRepairedAccident: true,
      },
    }
    const result = calculateUnderwriting({ ...mazda6Fixture.underwriting, vehicle })
    expect(result.decision).toBe('manual-review')
    expect(result.approvedMaxBuy).toBeNull()
    expect(result.economics.approvedMaxBuy).toBeNull()
    expect(result.manualReviewRequired).toBe(true)
    expect(result.hardReject).toBe(false)
    expect(result.rejectReasons).toEqual([])
    expect(result.adjustments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'minor-repaired-accident',
          amount: -200,
          bounded: true,
        }),
      ]),
    )
    expect(result.expectedRetailRange).toEqual({ low: 2_000, high: 2_300, midpoint: 2_150 })
  })

  it('does not apply the calibrated minor-accident adjustment without confirmed clean title', () => {
    const vehicle: Vehicle = {
      ...mazda6Fixture.vehicle,
      titleStatus: 'unknown',
      history: {
        ...mazda6Fixture.vehicle.history,
        titleStatus: 'unknown',
        minorRepairedAccident: true,
      },
    }
    const result = calculateUnderwriting({ ...mazda6Fixture.underwriting, vehicle })
    expect(result.decision).toBe('manual-review')
    expect(result.adjustments.some((item) => item.id === 'minor-repaired-accident')).toBe(false)
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('clean-title prerequisite is not confirmed'),
    ]))
  })

  it.each([
    ['structural damage', { history: { structuralDamage: undefined } }],
    ['flood damage', { history: { floodDamage: undefined } }],
    ['fire damage', { history: { fireDamage: undefined } }],
    ['airbags', { history: { unresolvedAirbags: undefined, airbagsResolved: undefined } }],
    ['airbags with resolved-only evidence', { history: { unresolvedAirbags: undefined, airbagsResolved: true } }],
    ['accident severity', { history: { accidentSeverity: 'unknown' as const } }],
    ['drivability', { condition: { drivability: 'unknown' as const } }],
  ])('requires manual review when %s is unknown', (_label, patch) => {
    const result = calculateUnderwriting({
      ...mazda6Fixture.underwriting,
      vehicle: vehicleWithRiskPatch(patch),
    })
    expect(result.decision).toBe('manual-review')
    expect(result.manualReviewRequired).toBe(true)
    expect(result.hardReject).toBe(false)
    expect(result.approvedMaxBuy).toBeNull()
  })

  it('fails closed on malformed or conflicting persisted risk values', () => {
    const malformedTitle = structuredClone(mazda6Fixture.underwriting)
    ;(malformedTitle.vehicle.history as Record<string, unknown>).titleStatus = 'not-recorded'
    ;(malformedTitle.vehicle as unknown as Record<string, unknown>).titleStatus = 'not-recorded'
    const malformedTitleResult = calculateUnderwriting(malformedTitle)
    expect(malformedTitleResult.decision).toBe('manual-review')
    expect(malformedTitleResult.approvedMaxBuy).toBeNull()

    const emptyPersistedEnums = structuredClone(mazda6Fixture.underwriting)
    ;(emptyPersistedEnums.vehicle.history as Record<string, unknown>).titleStatus = ''
    emptyPersistedEnums.vehicle.titleStatus = 'clean'
    ;(emptyPersistedEnums.vehicle.history as Record<string, unknown>).accidentSeverity = ''
    emptyPersistedEnums.vehicle.accidentSeverity = 'none'
    const emptyPersistedResult = calculateUnderwriting(emptyPersistedEnums)
    expect(emptyPersistedResult.decision).toBe('manual-review')
    expect(emptyPersistedResult.approvedMaxBuy).toBeNull()

    const conflictingStructural = structuredClone(mazda6Fixture.underwriting)
    conflictingStructural.vehicle.history!.structuralDamage = false
    conflictingStructural.vehicle.structuralDamage = true
    const conflictResult = calculateUnderwriting(conflictingStructural)
    expect(conflictResult.decision).toBe('hard-reject')
    expect(conflictResult.approvedMaxBuy).toBeNull()

    const malformedSeller = structuredClone(mazda6Fixture.underwriting)
    ;(malformedSeller.vehicle.history as Record<string, unknown>).titleInSellerName = 'unknown'
    ;(malformedSeller.vehicle as unknown as Record<string, unknown>).titleInSellerName = 'unknown'
    const malformedSellerResult = calculateUnderwriting(malformedSeller)
    expect(malformedSellerResult.decision).toBe('manual-review')
    expect(malformedSellerResult.approvedMaxBuy).toBeNull()

    const malformedBoolean = structuredClone(mazda6Fixture.underwriting)
    ;(malformedBoolean.vehicle.history as Record<string, unknown>).structuralDamage = 'unknown'
    malformedBoolean.vehicle.structuralDamage = false
    const malformedBooleanResult = calculateUnderwriting(malformedBoolean)
    expect(malformedBooleanResult.decision).toBe('manual-review')
    expect(malformedBooleanResult.approvedMaxBuy).toBeNull()

    const malformedAirbags = structuredClone(mazda6Fixture.underwriting)
    ;(malformedAirbags.vehicle.history as Record<string, unknown>).airbagsResolved = 'yes'
    const malformedAirbagResult = calculateUnderwriting(malformedAirbags)
    expect(malformedAirbagResult.decision).toBe('manual-review')
    expect(malformedAirbagResult.approvedMaxBuy).toBeNull()

    const unknownMinorRepair = structuredClone(mazda6Fixture.underwriting)
    delete unknownMinorRepair.vehicle.history!.minorRepairedAccident
    delete unknownMinorRepair.vehicle.minorRepairedAccident
    const unknownMinorResult = calculateUnderwriting(unknownMinorRepair)
    expect(unknownMinorResult.decision).toBe('manual-review')
    expect(unknownMinorResult.approvedMaxBuy).toBeNull()

    const unknownMaterialFault = structuredClone(mazda6Fixture.underwriting)
    delete unknownMaterialFault.vehicle.condition!.materialDrivabilityFault
    delete unknownMaterialFault.vehicle.materialDrivabilityFault
    const unknownMaterialResult = calculateUnderwriting(unknownMaterialFault)
    expect(unknownMaterialResult.decision).toBe('manual-review')
    expect(unknownMaterialResult.approvedMaxBuy).toBeNull()

    const nullRiskValues = structuredClone(mazda6Fixture.underwriting)
    ;(nullRiskValues.vehicle.history as Record<string, unknown>).structuralDamage = null
    nullRiskValues.vehicle.structuralDamage = false
    ;(nullRiskValues.vehicle.history as Record<string, unknown>).unresolvedAirbags = null
    nullRiskValues.vehicle.unresolvedAirbags = false
    ;(nullRiskValues.vehicle.history as Record<string, unknown>).minorRepairedAccident = null
    nullRiskValues.vehicle.minorRepairedAccident = false
    ;(nullRiskValues.vehicle.condition as Record<string, unknown>).materialDrivabilityFault = null
    nullRiskValues.vehicle.materialDrivabilityFault = false
    const nullRiskResult = calculateUnderwriting(nullRiskValues)
    expect(nullRiskResult.decision).toBe('manual-review')
    expect(nullRiskResult.approvedMaxBuy).toBeNull()
  })

  it('rejects invalid comparables without changing valid-comparable valuation', () => {
    const validComp = mazda6Fixture.comps[0]
    const invalidComps = [
      { ...validComp, id: 'zero-price', price: 0 },
      { ...validComp, id: 'negative-mileage', mileage: -1 },
      { ...validComp, id: 'negative-dom', daysListed: -1 },
      { ...validComp, id: 'blank-source', source: '   ' },
      { ...validComp, id: 'blank-captured-at', capturedAt: '  ' },
      { ...validComp },
      { ...validComp, id: 'invalid-status', status: 'mystery' as never },
    ]
    const validResult = calculateUnderwriting({
      ...mazda6Fixture.underwriting,
      comps: [validComp],
    })
    const result = calculateUnderwriting({
      ...mazda6Fixture.underwriting,
      comps: [validComp, ...invalidComps],
    })

    expect(result.compCount).toBe(1)
    expect(result.normalizedComps.map((comp) => comp.id)).toEqual([validComp.id])
    expect(result.quickSale).toBe(validResult.quickSale)
    expect(result.maxBuy).toBe(validResult.maxBuy)
    expect(result.expectedRetailRange).toEqual(validResult.expectedRetailRange)
    expect(result.projectedProfitRange).toEqual(validResult.projectedProfitRange)
    expect(result.roi).toBe(validResult.roi)
    expect(result.roiPercent).toBe(validResult.roiPercent)
    expect(result.roiRange).toEqual(validResult.roiRange)
    expect(result.confidenceScore).toBe(validResult.confidenceScore)
    expect(result.confidence).toBe(validResult.confidence)
    expect(result.economics).toEqual(validResult.economics)
    expect(result.decision).toBe(validResult.decision)
    expect(result.approvedMaxBuy).toBe(validResult.approvedMaxBuy)
    expect(result.warnings.filter((warning) => warning.startsWith('One comparable was skipped'))).toHaveLength(7)
  })

  it('clamps negative costs, proposed buy, and adjustment rates at the engine boundary', () => {
    const result = calculateUnderwriting({
      ...mazda6Fixture.underwriting,
      proposedBuy: -250,
      costs: {
        recon: -100,
        transport: -50,
        titleTaxTransaction: -25,
        riskReserve: -10,
        targetProfit: -200,
      },
      mileageAdjustmentPer10k: -200,
      daysListedAdjustmentPerDay: -2,
    })

    expect(result.proposedBuy).toBe(0)
    expect(result.economics).toEqual(expect.objectContaining({
      recon: 0,
      transport: 0,
      titleTaxTransaction: 0,
      riskReserve: 0,
      targetProfit: 0,
      totalCostsBeforePurchase: 0,
    }))
    expect(result.normalizedComps.every((comp) => comp.mileageAdjustment === 0 && comp.daysListedAdjustment === 0)).toBe(true)
    expect(result.maxBuy).toBe(2_350)
    expect(result.decision).toBe('go')
  })

  it('blocks approval when the raw max buy is zero or negative', () => {
    const result = calculateUnderwriting({
      ...mazda6Fixture.underwriting,
      costs: { ...mazda6Fixture.costs, targetProfit: 3_000 },
    })

    expect(result.maxBuy).toBe(-1_000)
    expect(result.decision).toBe('manual-review')
    expect(result.manualReviewRequired).toBe(true)
    expect(result.approvedMaxBuy).toBeNull()
    expect(result.economics.approvedMaxBuy).toBeNull()
  })

  it.each([
    ['branded title', { titleStatus: 'branded' as const }],
    ['structural damage', { structuralDamage: true }],
    ['flood damage', { floodDamage: true }],
    ['fire damage', { fireDamage: true }],
    ['unresolved airbags', { unresolvedAirbags: true }],
    ['title not in seller name', { titleInSellerName: false }],
    ['material drivability fault', { materialDrivabilityFault: true }],
  ])('hard rejects %s', (_label, historyPatch) => {
    const vehicle: Vehicle = {
      ...mazda6Fixture.vehicle,
      ...historyPatch,
      history: { ...mazda6Fixture.vehicle.history, ...historyPatch },
    }
    const result = calculateUnderwriting({ ...mazda6Fixture.underwriting, vehicle })
    expect(result.hardReject).toBe(true)
    expect(result.manualReviewRequired).toBe(true)
    expect(result.decision).toBe('hard-reject')
    expect(result.approvedMaxBuy).toBeNull()
    expect(result.rejectReasons.length).toBeGreaterThan(0)
    expect(result.confidence).toBe('blocked')
  })

  it('returns the seller draft sequence in the locked order with pending approval metadata', () => {
    const sequence = createSellerDraftSequence({
      sellerName: 'Alex',
      vehicle: mazda6Fixture.vehicle,
      proposedBuy: 1_500,
      maxBuy: 1_500,
    })
    expect(sequence.map((step) => step.key)).toEqual([
      'availability',
      'condition-title',
      'negotiability',
      'evidence-offer',
    ])
    expect(sequence.every((step) => step.approval.required && step.approval.status === 'pending')).toBe(true)
    expect(sequence[3].prompt).toContain('$1,500')
    expect(sequence[3].prompt).toContain('will not exceed $1,500')
    expect(sellerDraftSequence.map((step) => step.key)).toEqual(sequence.map((step) => step.key))
  })

  it('does not mutate a fixture input and is repeatable for the same facts', () => {
    const input = structuredClone(mazda6Fixture.underwriting)
    const before = structuredClone(input)
    const first = calculateUnderwriting(input)
    const second = calculateUnderwriting(input)
    expect(input).toEqual(before)
    expect(second).toEqual(first)
  })
})
