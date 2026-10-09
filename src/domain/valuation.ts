import type {
  AccidentSeverity,
  Adjustment,
  ApprovalMetadata,
  ComparableVehicle,
  ConfidenceLevel,
  EvidenceReceipt,
  Money,
  MoneyRange,
  NormalizedComparable,
  SellerDraftContext,
  SellerDraftSequence,
  SellerDraftStep,
  TitleStatus,
  UnderwritingCosts,
  UnderwritingInput,
  UnderwritingResult,
  Vehicle,
  VehicleEvidence,
  VehicleHistory,
} from './types'

export const DEFAULT_TARGET_DAYS_LISTED = 30
export const DEFAULT_MILEAGE_ADJUSTMENT_PER_10K = 200
export const DEFAULT_DAYS_LISTED_ADJUSTMENT_PER_DAY = 2
export const MINOR_REPAIRED_ACCIDENT_RATE = 0.08
export const MINOR_REPAIRED_ACCIDENT_MIN = 150
export const MINOR_REPAIRED_ACCIDENT_MAX = 5_000

const DEFAULT_COSTS: UnderwritingCosts = {
  recon: 0,
  transport: 0,
  titleTaxTransaction: 0,
  riskReserve: 0,
  targetProfit: 0,
}

const STATUS_WEIGHTS: Record<ComparableVehicle['status'], number> = {
  sold: 1,
  active: 0.5,
  pending: 0.65,
  expired: 0.25,
  unknown: 0.2,
}

const HARD_TITLE_STATUSES = new Set([
  'branded',
  'branded-title',
  'salvage',
  'salvage-title',
  'reconstructed',
  'rebuilt',
  'flood',
  'flood-title',
  'fire',
  'fire-title',
  'structural',
  'structural-title',
])

const KNOWN_TITLE_STATUSES = new Set([
  'clean',
  'clean-title',
  'repaired',
  'repaired-title',
  ...HARD_TITLE_STATUSES,
  'unknown',
])

const KNOWN_ACCIDENT_SEVERITIES = new Set<AccidentSeverity>([
  'none',
  'minor',
  'minor-repaired',
  'moderate',
  'major',
  'unknown',
])

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback))
}

function nonBlank(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function roundMoney(value: number): number {
  return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100
}

function roundPercent(value: number): number {
  return Math.round((finiteNumber(value) + Number.EPSILON) * 10) / 10
}

function roundToFifty(value: number): number {
  return Math.round(finiteNumber(value) / 50) * 50
}

function median(values: readonly number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function normalizeTitleStatus(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-')
  return KNOWN_TITLE_STATUSES.has(normalized) ? normalized : undefined
}

function mergeRiskBoolean(historyValue: unknown, aliasValue: unknown): boolean | undefined {
  const hasMalformedValue = [historyValue, aliasValue].some(
    (value) => value !== undefined && typeof value !== 'boolean',
  )
  if (hasMalformedValue) return undefined
  if (historyValue === true || aliasValue === true) return true
  if (historyValue === false || aliasValue === false) return false
  return undefined
}

function mergeRequiredTrue(historyValue: unknown, aliasValue: unknown): boolean | undefined {
  const hasMalformedValue = [historyValue, aliasValue].some(
    (value) => value !== undefined && typeof value !== 'boolean',
  )
  if (hasMalformedValue) return undefined
  if (historyValue === false || aliasValue === false) return false
  if (historyValue === true || aliasValue === true) return true
  return undefined
}

function mergeTitleStatus(historyValue: unknown, aliasValue: unknown): TitleStatus | undefined {
  const rawValues = [historyValue, aliasValue]
  const values = rawValues.map(normalizeTitleStatus).filter(
    (value): value is TitleStatus => Boolean(value),
  )
  const hard = values.find((value) => HARD_TITLE_STATUSES.has(value))
  if (hard) return hard
  const hasInvalidValue = rawValues.some(
    (value) => value !== undefined && !normalizeTitleStatus(value),
  )
  if (hasInvalidValue) return undefined
  const unique = [...new Set(values)]
  return unique.length === 1 ? unique[0] : undefined
}

function mergeAccidentSeverity(historyValue: unknown, aliasValue: unknown): AccidentSeverity | undefined {
  const rawValues = [historyValue, aliasValue]
  const values = rawValues.filter(
    (value): value is AccidentSeverity =>
      typeof value === 'string' && KNOWN_ACCIDENT_SEVERITIES.has(value as AccidentSeverity),
  )
  const hasInvalidValue = rawValues.some(
    (value) =>
      value !== undefined &&
      !(typeof value === 'string' && KNOWN_ACCIDENT_SEVERITIES.has(value as AccidentSeverity)),
  )
  if (hasInvalidValue) return undefined
  const unique = [...new Set(values)]
  return unique.length === 1 ? unique[0] : undefined
}

function mergedHistory(vehicle: Vehicle): VehicleHistory {
  return {
    ...(vehicle.history ?? {}),
    titleStatus: mergeTitleStatus(vehicle.history?.titleStatus, vehicle.titleStatus),
    titleInSellerName: mergeRequiredTrue(
      vehicle.history?.titleInSellerName,
      vehicle.titleInSellerName,
    ),
    minorRepairedAccident: mergeRiskBoolean(
      vehicle.history?.minorRepairedAccident,
      vehicle.minorRepairedAccident,
    ),
    accidentSeverity: mergeAccidentSeverity(
      vehicle.history?.accidentSeverity,
      vehicle.accidentSeverity,
    ),
    structuralDamage: mergeRiskBoolean(
      vehicle.history?.structuralDamage,
      vehicle.structuralDamage,
    ),
    floodDamage: mergeRiskBoolean(vehicle.history?.floodDamage, vehicle.floodDamage),
    fireDamage: mergeRiskBoolean(vehicle.history?.fireDamage, vehicle.fireDamage),
    unresolvedAirbags: mergeRiskBoolean(
      vehicle.history?.unresolvedAirbags,
      vehicle.unresolvedAirbags,
    ),
    airbagsResolved: mergeRequiredTrue(vehicle.history?.airbagsResolved, undefined),
  }
}

function statusWeight(status: ComparableVehicle['status']): number {
  return STATUS_WEIGHTS[status] ?? STATUS_WEIGHTS.unknown
}

function normalizeComparable(
  comp: ComparableVehicle,
  targetMileage: number,
  targetDaysListed: number,
  mileageRate: number,
  daysRate: number,
): NormalizedComparable {
  const mileage = finiteNumber(comp.mileage)
  const price = finiteNumber(comp.price)
  const daysListed = finiteNumber(comp.daysListed)
  // A higher-mileage comp is adjusted up to the subject's mileage. A comp
  // that sat longer than the target DOM is adjusted down because the observed
  // ask/sale showed weaker liquidity, matching the operator's "month-old ask
  // is probably too high" rule.
  const mileageAdjustment = roundMoney(((mileage - targetMileage) / 10_000) * mileageRate)
  const daysListedAdjustment = roundMoney((targetDaysListed - daysListed) * daysRate)
  const normalizedPrice = roundMoney(price + mileageAdjustment + daysListedAdjustment)
  const weight = statusWeight(comp.status)
  const explanation = [
    `mileage ${mileage.toLocaleString()} vs ${targetMileage.toLocaleString()} contributes ${formatSignedMoney(mileageAdjustment)}`,
    `DOM ${daysListed} vs ${targetDaysListed} contributes ${formatSignedMoney(daysListedAdjustment)}`,
    `${comp.status} comp weight ${weight.toFixed(2)}`,
  ].join('; ')

  return {
    ...comp,
    mileage,
    price,
    daysListed,
    mileageAdjustment,
    daysListedAdjustment,
    statusWeight: weight,
    normalizedPrice,
    explanation,
  }
}

function formatSignedMoney(value: number): string {
  const rounded = roundMoney(value)
  return `${rounded >= 0 ? '+' : '-'}$${Math.abs(rounded).toLocaleString('en-US', {
    maximumFractionDigits: 2,
  })}`
}

function makeRange(low: number, high: number, midpoint = (low + high) / 2): MoneyRange {
  const normalizedLow = roundMoney(Math.min(low, high))
  const normalizedHigh = roundMoney(Math.max(low, high))
  return {
    low: normalizedLow,
    high: normalizedHigh,
    midpoint: roundMoney(Math.min(normalizedHigh, Math.max(normalizedLow, midpoint))),
  }
}

function applyRangeAdjustment(range: MoneyRange, amount: number): MoneyRange {
  return makeRange(range.low + amount, range.high + amount, range.midpoint + amount)
}

function normalizeCosts(costs: UnderwritingInput['costs']): UnderwritingCosts {
  return {
    recon: nonNegative(costs?.recon),
    transport: nonNegative(costs?.transport),
    titleTaxTransaction: nonNegative(costs?.titleTaxTransaction),
    riskReserve: nonNegative(costs?.riskReserve),
    targetProfit: nonNegative(costs?.targetProfit),
  }
}

function asVehicle(input: UnderwritingInput): Vehicle {
  return input.vehicle ?? ({ year: 0, make: '', model: '', mileage: 0 } as Vehicle)
}

function policyFindings(vehicle: Vehicle, baseRetailMidpoint: number): {
  historyAdjustment: number
  adjustments: Adjustment[]
  warnings: string[]
  rejectReasons: string[]
  manualReview: boolean
} {
  const history = mergedHistory(vehicle)
  const adjustments: Adjustment[] = []
  const warnings: string[] = []
  const rejectReasons: string[] = []
  let manualReview = false

  const titleStatus = normalizeTitleStatus(history.titleStatus)
  if (titleStatus && HARD_TITLE_STATUSES.has(titleStatus)) {
    const titleLabel = titleStatus.replace(/-/g, ' ')
    rejectReasons.push(`Hard reject: ${titleLabel} title is outside the buy box.`)
  } else if (!titleStatus || titleStatus === 'unknown') {
    warnings.push('Title status is not confirmed; verify the physical title before any offer.')
    manualReview = true
  } else if (titleStatus === 'repaired' || titleStatus === 'repaired-title') {
    warnings.push('Repaired title requires manual title and inspection review.')
    manualReview = true
  }

  if (history.titleInSellerName === false) {
    rejectReasons.push('Hard reject: title is not in the seller\'s name.')
  } else if (history.titleInSellerName === undefined) {
    warnings.push('Seller-name/title match is unconfirmed; request a title photo.')
    manualReview = true
  }

  const structural = history.structuralDamage
  const flood = history.floodDamage
  const fire = history.fireDamage
  if (structural === true) {
    rejectReasons.push('Hard reject: structural damage is present.')
  } else if (structural !== false) {
    warnings.push('Structural damage status is unconfirmed; obtain explicit confirmation before approval.')
    manualReview = true
  }
  if (flood === true) {
    rejectReasons.push('Hard reject: flood damage is present.')
  } else if (flood !== false) {
    warnings.push('Flood damage status is unconfirmed; obtain explicit confirmation before approval.')
    manualReview = true
  }
  if (fire === true) {
    rejectReasons.push('Hard reject: fire damage is present.')
  } else if (fire !== false) {
    warnings.push('Fire damage status is unconfirmed; obtain explicit confirmation before approval.')
    manualReview = true
  }

  const airbagsUnresolved = history.unresolvedAirbags
  const airbagsResolved = history.airbagsResolved
  if (airbagsUnresolved === true || airbagsResolved === false) {
    rejectReasons.push('Hard reject: unresolved airbag safety issue.')
  } else if (airbagsUnresolved !== false || airbagsResolved !== true) {
    warnings.push('Airbag status is unconfirmed; explicitly record unresolved airbags as false and airbags resolved as true before approval.')
    manualReview = true
  }

  const materialDrivabilityFault = mergeRiskBoolean(
    vehicle.condition?.materialDrivabilityFault,
    vehicle.materialDrivabilityFault,
  )
  if (materialDrivabilityFault === true || vehicle.condition?.drivability === 'material-fault') {
    rejectReasons.push('Hard reject: material drivability fault is present.')
  } else if (materialDrivabilityFault !== false || vehicle.condition?.drivability !== 'clear') {
    warnings.push('Drivability status is unconfirmed; complete an inspection before approval.')
    manualReview = true
  }

  const accidentSeverity = history.accidentSeverity
  const minorRepairedAccident = history.minorRepairedAccident === true || accidentSeverity === 'minor-repaired'
  const cleanTitleConfirmed = titleStatus === 'clean' || titleStatus === 'clean-title'
  if (minorRepairedAccident && cleanTitleConfirmed && !rejectReasons.length) {
    const minorAccidentDeduction = roundToFifty(
      Math.min(
        MINOR_REPAIRED_ACCIDENT_MAX,
        Math.max(MINOR_REPAIRED_ACCIDENT_MIN, baseRetailMidpoint * MINOR_REPAIRED_ACCIDENT_RATE),
      ),
    )
    adjustments.push({
      id: 'minor-repaired-accident',
      category: 'history',
      label: 'Minor repaired accident',
      amount: -minorAccidentDeduction,
      bounded: true,
      explanation:
        `Apply a bounded 8% marketability adjustment ($${minorAccidentDeduction.toLocaleString()}, with a $150 minimum and $5,000 cap) only when the title is clean and no structural, airbag, or drivability issue is known.`,
    })
    warnings.push('Minor repaired accident: bounded adjustment applied; inspect repairs and retain manual approval.')
    manualReview = true
  } else if (minorRepairedAccident) {
    warnings.push('Minor repaired accident is present, but the clean-title prerequisite is not confirmed; no calibrated accident adjustment is approved.')
    manualReview = true
  } else if (history.minorRepairedAccident === undefined) {
    warnings.push('Minor repaired accident status is unconfirmed; explicitly record it before approval.')
    manualReview = true
  } else if (accidentSeverity === 'moderate' || accidentSeverity === 'major') {
    warnings.push('Accident severity is above minor; obtain repair documentation and manual review.')
    manualReview = true
  } else if (accidentSeverity === 'minor') {
    warnings.push('Minor accident history is not explicitly documented as repaired; obtain repair documentation and manual review.')
    manualReview = true
  } else if (accidentSeverity !== 'none') {
    warnings.push('Accident severity is unconfirmed; obtain a documented history before approval.')
    manualReview = true
  }

  return {
    historyAdjustment: adjustments.reduce((total, adjustment) => total + adjustment.amount, 0),
    adjustments,
    warnings,
    rejectReasons,
    manualReview,
  }
}

function evidenceReceipts(evidence: readonly VehicleEvidence[] | undefined): {
  receipts: EvidenceReceipt[]
  warnings: string[]
  adjustments: Adjustment[]
} {
  const receipts: EvidenceReceipt[] = []
  const warnings: string[] = []
  const adjustments: Adjustment[] = []
  for (const item of evidence ?? []) {
    const source = typeof item.source === 'string' ? item.source.trim() : ''
    const capturedAt = typeof item.capturedAt === 'string' ? item.capturedAt.trim() : ''
    const status: EvidenceReceipt['status'] = !source
      ? 'missing-source'
      : !capturedAt
        ? 'missing-timestamp'
        : 'timestamped'
    receipts.push({
      id: item.id,
      kind: item.kind,
      source,
      capturedAt,
      value: item.value,
      status,
    })
    if (status === 'missing-source') {
      warnings.push(`Evidence ${item.id} is missing a source name.`)
    } else if (status === 'missing-timestamp') {
      warnings.push(`Evidence ${item.id} (${source}) is missing its captured timestamp.`)
    } else {
      adjustments.push({
        id: `evidence-${item.id}`,
        category: 'evidence',
        label: `${source} evidence`,
        amount: 0,
        source,
        explanation: `User-supplied ${item.kind} evidence captured at ${capturedAt}; it supports confidence but does not silently change the comp price.`,
      })
    }
  }
  return { receipts, warnings, adjustments }
}

function confidenceFor(
  compCount: number,
  evidence: readonly EvidenceReceipt[],
  warnings: readonly string[],
  manualReview: boolean,
  hardReject: boolean,
): { level: ConfidenceLevel; score: number } {
  if (hardReject) return { level: 'blocked', score: 0 }
  let score = compCount >= 5 ? 0.88 : compCount >= 3 ? 0.75 : compCount >= 1 ? 0.52 : 0.15
  if (evidence.length > 0 && evidence.every((item) => item.status === 'timestamped')) score += 0.1
  if (warnings.some((warning) => warning.toLowerCase().includes('title'))) score -= 0.05
  if (manualReview) score = Math.min(score, 0.58)
  score = Math.max(0, Math.min(1, score))
  const level: ConfidenceLevel = score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low'
  return { level, score: roundPercent(score * 100) / 100 }
}

/**
 * Calculate deterministic underwriting from user-entered comps and evidence.
 * No network, clock, random values, or hidden adjustment is used.
 */
export function calculateUnderwriting(input: UnderwritingInput): UnderwritingResult {
  const vehicle = asVehicle(input)
  const warnings: string[] = []
  const explanations: string[] = []
  const adjustments: Adjustment[] = []
  const targetMileage = nonNegative(vehicle.mileage)
  const targetDaysListed = nonNegative(input.targetDaysListed, DEFAULT_TARGET_DAYS_LISTED)
  const mileageRate = nonNegative(
    input.mileageAdjustmentPer10k,
    DEFAULT_MILEAGE_ADJUSTMENT_PER_10K,
  )
  const daysRate = nonNegative(
    input.daysListedAdjustmentPerDay,
    DEFAULT_DAYS_LISTED_ADJUSTMENT_PER_DAY,
  )
  const rawComps = Array.isArray(input.comps) ? input.comps : []
  const seenCompIds = new Set<string>()
  const validComps = rawComps.filter((comp): comp is ComparableVehicle => {
    const compId = typeof comp?.id === 'string' ? comp.id.trim() : ''
    const valid =
      comp !== null &&
      typeof comp === 'object' &&
      Boolean(compId) &&
      !seenCompIds.has(compId) &&
      Object.prototype.hasOwnProperty.call(STATUS_WEIGHTS, comp.status) &&
      Number.isFinite(comp.mileage) &&
      comp.mileage >= 0 &&
      Number.isFinite(comp.price) &&
      comp.price > 0 &&
      Number.isFinite(comp.daysListed) &&
      comp.daysListed >= 0 &&
      nonBlank(comp.source) &&
      nonBlank(comp.capturedAt)
    if (!valid) {
      warnings.push(
        'One comparable was skipped because it requires a unique nonblank id, known status, positive price, non-negative mileage and days listed, source, and captured timestamp.',
      )
    } else {
      seenCompIds.add(compId)
    }
    return valid
  })

  const normalizedComps = validComps.map((comp) =>
    normalizeComparable(comp, targetMileage, targetDaysListed, mileageRate, daysRate),
  )
  for (const comp of normalizedComps) {
    adjustments.push({
      id: `${comp.id}-mileage`,
      category: 'mileage',
      label: `${comp.id} mileage normalization`,
      amount: comp.mileageAdjustment,
      compId: comp.id,
      explanation: `Normalize ${comp.id} to ${targetMileage.toLocaleString()} subject miles at ${formatSignedMoney(comp.mileageAdjustment)}.`,
    })
    adjustments.push({
      id: `${comp.id}-dom`,
      category: 'days-listed',
      label: `${comp.id} days-listed normalization`,
      amount: comp.daysListedAdjustment,
      compId: comp.id,
      explanation: `Normalize ${comp.id} from ${comp.daysListed} to the ${targetDaysListed}-day baseline at ${formatSignedMoney(comp.daysListedAdjustment)}.`,
    })
    adjustments.push({
      id: `${comp.id}-status`,
      category: 'status',
      label: `${comp.id} status weighting`,
      amount: 0,
      compId: comp.id,
      explanation: `${comp.status} comp contributes at ${comp.statusWeight.toFixed(2)} weight; status changes confidence/weight, not price silently.`,
    })
  }

  if (!normalizedComps.length) {
    warnings.push('No valid manually entered comparables; retail and quick-sale values are unavailable.')
    explanations.push('At least one comparable with a positive price, non-negative mileage and days listed, status, source, and captured timestamp is required.')
  }

  const normalizedValues = normalizedComps.map((comp) => comp.normalizedPrice)
  const weightedTotal = normalizedComps.reduce((total, comp) => total + comp.statusWeight, 0)
  const weightedMean = weightedTotal
    ? normalizedComps.reduce((total, comp) => total + comp.normalizedPrice * comp.statusWeight, 0) /
      weightedTotal
    : 0
  const spreadRange = normalizedValues.length
    ? makeRange(roundToFifty(Math.min(...normalizedValues)), roundToFifty(Math.max(...normalizedValues)), roundToFifty(weightedMean))
    : makeRange(0, 0, 0)

  const policy = policyFindings(vehicle, spreadRange.midpoint)
  adjustments.push(...policy.adjustments)
  warnings.push(...policy.warnings)
  const evidenceResult = evidenceReceipts(input.evidence)
  adjustments.push(...evidenceResult.adjustments)
  warnings.push(...evidenceResult.warnings)

  let retailRange = applyRangeAdjustment(spreadRange, policy.historyAdjustment)
  // Do not let a bounded history adjustment create a negative retail value.
  retailRange = makeRange(Math.max(0, retailRange.low), Math.max(0, retailRange.high), Math.max(0, retailRange.midpoint))
  const quickSale = roundToFifty(retailRange.midpoint)
  const costs = normalizeCosts(input.costs)
  const totalCostsBeforePurchase = roundMoney(
    costs.recon + costs.transport + costs.titleTaxTransaction + costs.riskReserve,
  )
  const maxBuy = roundMoney(quickSale - totalCostsBeforePurchase - costs.targetProfit)
  const requestedProposedBuyValue = nonNegative(input.proposedBuy ?? input.purchasePrice, Number.NaN)
  const hasProposedBuy = Number.isFinite(requestedProposedBuyValue)
  const proposedBuyValue = hasProposedBuy
    ? Math.min(requestedProposedBuyValue, Math.max(0, maxBuy))
    : Number.NaN
  const scenarioBuy = hasProposedBuy ? requestedProposedBuyValue : maxBuy
  const projectedProfitRange = makeRange(
    retailRange.low - totalCostsBeforePurchase - scenarioBuy,
    retailRange.high - totalCostsBeforePurchase - scenarioBuy,
    retailRange.midpoint - totalCostsBeforePurchase - scenarioBuy,
  )
  const investment = scenarioBuy + totalCostsBeforePurchase
  const roiRange = investment > 0
    ? makeRange(
        (projectedProfitRange.low / investment) * 100,
        (projectedProfitRange.high / investment) * 100,
        (projectedProfitRange.midpoint / investment) * 100,
      )
    : makeRange(0, 0, 0)

  const rejectReasons = [...policy.rejectReasons]
  const hardReject = rejectReasons.length > 0
  const maxBuyBlocked = maxBuy <= 0
  const proposedBuyExceedsMax = hasProposedBuy && requestedProposedBuyValue > maxBuy
  if (maxBuyBlocked) {
    warnings.push('Raw max buy is zero or negative; manual review is required before approval.')
  }
  if (proposedBuyExceedsMax) {
    warnings.push(`Requested proposed buy ${requestedProposedBuyValue} exceeds raw max buy ${maxBuy}; the offer value is capped and manual review is required.`)
  }
  const incompleteEvidence = evidenceResult.warnings.length > 0
  const noValidComps = normalizedComps.length === 0
  const manualReviewRequired =
    policy.manualReview ||
    hardReject ||
    noValidComps ||
    incompleteEvidence ||
    maxBuyBlocked ||
    proposedBuyExceedsMax
  if (manualReviewRequired && !hardReject) {
    explanations.push('Manual approval is required before sending an offer because one or more facts remain bounded or unconfirmed.')
  }
  if (hardReject) {
    explanations.push('The gate is hard reject; do not send an offer until the disqualifying fact is corrected and re-underwritten.')
  }
  if (normalizedComps.length) {
    explanations.push(
      `Retail range is the rounded normalized comp spread ($${retailRange.low.toLocaleString()}–$${retailRange.high.toLocaleString()}); quick-sale is the weighted midpoint ($${quickSale.toLocaleString()}).`,
    )
  }
  explanations.push(
    `maxBuy = quickSale ${quickSale} - recon ${costs.recon} - transport ${costs.transport} - title/tax/transaction ${costs.titleTaxTransaction} - risk reserve ${costs.riskReserve} - target profit ${costs.targetProfit} = ${maxBuy}.`,
  )
  explanations.push(
    `Projected profit uses retail range less known costs (${totalCostsBeforePurchase}) and proposed buy ${scenarioBuy}.`,
  )

  const confidence = confidenceFor(
    normalizedComps.length,
    evidenceResult.receipts,
    warnings,
    manualReviewRequired,
    hardReject,
  )
  const decision: UnderwritingResult['decision'] = hardReject
    ? 'hard-reject'
    : manualReviewRequired
      ? 'manual-review'
      : 'go'
  const approvedMaxBuy = manualReviewRequired ? null : maxBuy

  const economics = {
    quickSale,
    recon: costs.recon,
    transport: costs.transport,
    titleTaxTransaction: costs.titleTaxTransaction,
    riskReserve: costs.riskReserve,
    targetProfit: costs.targetProfit,
    totalCostsBeforePurchase,
    maxBuyFormula:
      'quickSale - recon - transport - titleTaxTransaction - riskReserve - targetProfit',
    maxBuy,
    approvedMaxBuy,
  }

  return {
    expectedRetailRange: retailRange,
    expectedRetail: retailRange,
    retailRange,
    quickSale,
    maxBuy,
    approvedMaxBuy,
    requestedProposedBuy: hasProposedBuy ? roundMoney(requestedProposedBuyValue) : undefined,
    proposedBuy: hasProposedBuy ? roundMoney(proposedBuyValue) : undefined,
    projectedProfitRange,
    roi: roiRange.midpoint,
    roiPercent: roiRange.midpoint,
    roiRange,
    confidence: confidence.level,
    confidenceScore: confidence.score,
    compCount: normalizedComps.length,
    normalizedComps,
    adjustments,
    explanations,
    warnings,
    rejectReasons,
    decision,
    manualReviewRequired,
    hardReject,
    evidence: evidenceResult.receipts,
    economics,
  }
}

/** Compatibility alias for callers that call the operation "valuation". */
export const calculateValuation = calculateUnderwriting
export const underwrite = calculateUnderwriting

function approval(): ApprovalMetadata {
  return { required: true, status: 'pending' }
}

/**
 * Return the seller conversation as four drafts. Sending remains a separate,
 * approved action; every step carries explicit pending approval metadata.
 */
export function createSellerDraftSequence(context: SellerDraftContext = {}): SellerDraftSequence {
  const vehicleName = context.vehicle
    ? `${context.vehicle.year} ${context.vehicle.make} ${context.vehicle.model}`
    : 'the vehicle'
  const seller = context.sellerName ? ` ${context.sellerName}` : ''
  const offer = Number.isFinite(context.proposedBuy)
    ? `$${roundMoney(context.proposedBuy as number).toLocaleString()}`
    : 'the proposed offer'
  const maxBuy = Number.isFinite(context.maxBuy)
    ? `$${roundMoney(context.maxBuy as number).toLocaleString()}`
    : 'the underwritten max buy'
  return [
    {
      key: 'availability',
      label: 'Availability',
      objective: 'Confirm the listing is still available before discussing price.',
      prompt: `Hi${seller} — is the ${vehicleName} still available, and when could I see it?`,
      requiredFields: ['availability', 'viewingWindow'],
      approval: approval(),
    },
    {
      key: 'condition-title',
      label: 'Condition + title',
      objective: 'Capture condition, title ownership, accidents, airbags, and drivability facts.',
      prompt:
        'Before I come by, can you confirm the title is in your name, whether it is clean, any accident/structural/flood/fire history, airbag status, and known mechanical issues?',
      requiredFields: ['titleStatus', 'titleInSellerName', 'accidentHistory', 'airbagStatus', 'drivability'],
      approval: approval(),
    },
    {
      key: 'negotiability',
      label: 'Negotiability',
      objective: 'Ask for the seller\'s price flexibility without making an unapproved offer.',
      prompt: `What is the best price you would take for the ${vehicleName} if I can inspect it promptly?`,
      requiredFields: ['askingPrice', 'bestPrice', 'timing'],
      approval: approval(),
    },
    {
      key: 'evidence-offer',
      label: 'Evidence + offer',
      objective: 'Request evidence, then prepare an offer for owner approval against the underwritten limit.',
      prompt: `Could you send a title/VIN photo and any service or history records? I can prepare ${offer} for review; I will not exceed ${maxBuy} without updated underwriting.`,
      requiredFields: ['titlePhoto', 'vinPhoto', 'serviceEvidence', 'offerAmount', 'approval'],
      approval: approval(),
    },
  ]
}

export const sellerDraftSequence: SellerDraftSequence = createSellerDraftSequence()
export const SELLER_DRAFT_SEQUENCE = sellerDraftSequence
export const SELLER_DRAFT_STEPS = sellerDraftSequence
