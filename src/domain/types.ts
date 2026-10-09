/**
 * Domain types for Carsplore's local-first vehicle underwriting flow.
 *
 * These types intentionally describe facts that a user has entered or
 * observed.  They do not model an API response: the valuation engine is
 * deterministic and can be run from a fixture or from a saved local draft.
 */

export type Money = number

export type TitleStatus =
  | 'clean'
  | 'clean-title'
  | 'repaired'
  | 'repaired-title'
  | 'salvage'
  | 'salvage-title'
  | 'branded'
  | 'branded-title'
  | 'flood'
  | 'flood-title'
  | 'fire'
  | 'fire-title'
  | 'structural'
  | 'structural-title'
  | 'rebuilt'
  | 'reconstructed'
  | 'unknown'

export type AccidentSeverity =
  | 'none'
  | 'minor'
  | 'minor-repaired'
  | 'moderate'
  | 'major'
  | 'unknown'

export type DrivabilityStatus =
  | 'clear'
  | 'unknown'
  | 'minor-fault'
  | 'material-fault'

export type CompStatus = 'sold' | 'active' | 'pending' | 'expired' | 'unknown'

export type EvidenceKind = 'kbb' | 'mmr' | 'carfax' | 'inspection' | 'seller' | 'other'

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'blocked'

export type UnderwritingDecision = 'go' | 'manual-review' | 'hard-reject'

export interface VehicleHistory {
  /** The title status as represented by the seller's title/evidence. */
  titleStatus?: TitleStatus
  /** True when the seller explicitly says the title is in their name. */
  titleInSellerName?: boolean
  /** A minor accident that has been repaired and has no known structural fault. */
  minorRepairedAccident?: boolean
  accidentSeverity?: AccidentSeverity
  structuralDamage?: boolean
  floodDamage?: boolean
  fireDamage?: boolean
  /** True when the airbag issue has not been resolved/documented. */
  unresolvedAirbags?: boolean
  airbagsResolved?: boolean
  notes?: string
}

export interface VehicleCondition {
  drivability?: DrivabilityStatus
  /** Material drivability problems such as transmission, engine, or unsafe braking. */
  materialDrivabilityFault?: boolean
  reconNotes?: string
}

export interface Vehicle {
  year: number
  make: string
  model: string
  trim?: string
  mileage: number
  titleStatus?: TitleStatus
  titleInSellerName?: boolean
  history?: VehicleHistory
  condition?: VehicleCondition
  /** Convenience aliases for simple fixture/manual-entry forms. */
  accidentSeverity?: AccidentSeverity
  minorRepairedAccident?: boolean
  structuralDamage?: boolean
  floodDamage?: boolean
  fireDamage?: boolean
  unresolvedAirbags?: boolean
  materialDrivabilityFault?: boolean
  sellerName?: string
  vinLast6?: string
}

/** A manually entered market comparable. */
export interface ComparableVehicle {
  id: string
  year?: number
  make?: string
  model?: string
  trim?: string
  mileage: number
  price: Money
  daysListed: number
  status: CompStatus
  source?: string
  capturedAt?: string
  notes?: string
}

/** Short alias used by the UI and tests. */
export type Comparable = ComparableVehicle
export type Comp = ComparableVehicle

/** User-supplied KBB/MMR/CARFAX-like evidence. */
export interface VehicleEvidence {
  id: string
  kind: EvidenceKind
  /** Human-readable source name, e.g. "KBB" or "CARFAX report". */
  source: string
  /** ISO date/time supplied by the user when the evidence was observed. */
  capturedAt: string
  value?: Money
  reference?: string
  notes?: string
  titleStatus?: TitleStatus
  verified?: boolean
}

export type Evidence = VehicleEvidence

export interface UnderwritingCosts {
  recon: Money
  transport: Money
  titleTaxTransaction: Money
  riskReserve: Money
  targetProfit: Money
}

export type PartialUnderwritingCosts = Partial<UnderwritingCosts>

export interface UnderwritingInput {
  vehicle: Vehicle
  comps: readonly ComparableVehicle[]
  evidence?: readonly VehicleEvidence[]
  costs?: PartialUnderwritingCosts
  /** Purchase price used for the projected profit/ROI scenario. */
  proposedBuy?: Money
  /** Alias accepted for callers that call the offer a purchase price. */
  purchasePrice?: Money
  /** DOM baseline used when normalizing comps; defaults to 30 days. */
  targetDaysListed?: number
  /** Mileage adjustment per 10,000 miles; defaults to $200. */
  mileageAdjustmentPer10k?: Money
  /** DOM adjustment per day; defaults to $2. */
  daysListedAdjustmentPerDay?: Money
}

export type ValuationInput = UnderwritingInput

export interface MoneyRange {
  low: Money
  high: Money
  midpoint: Money
}

export interface Adjustment {
  id: string
  category: 'mileage' | 'days-listed' | 'status' | 'history' | 'evidence' | 'policy'
  label: string
  amount: Money
  explanation: string
  /** A bounded adjustment is deliberately capped by policy. */
  bounded?: boolean
  source?: string
  compId?: string
}

export interface NormalizedComparable extends ComparableVehicle {
  mileageAdjustment: Money
  daysListedAdjustment: Money
  statusWeight: number
  normalizedPrice: Money
  explanation: string
}

export interface EvidenceReceipt {
  id: string
  kind: EvidenceKind
  source: string
  capturedAt: string
  value?: Money
  status: 'timestamped' | 'missing-source' | 'missing-timestamp'
}

export interface CalculationEconomics {
  quickSale: Money
  recon: Money
  transport: Money
  titleTaxTransaction: Money
  riskReserve: Money
  targetProfit: Money
  totalCostsBeforePurchase: Money
  maxBuyFormula: string
  maxBuy: Money
  /** A hard-stop/manual-review vehicle has no approved buy until a human resolves it. */
  approvedMaxBuy: Money | null
}

export interface UnderwritingResult {
  expectedRetailRange: MoneyRange
  /** Compatibility alias for consumers that use the shorter name. */
  expectedRetail: MoneyRange
  retailRange: MoneyRange
  quickSale: Money
  maxBuy: Money
  /** Null whenever the decision is manual-review or hard-reject. */
  approvedMaxBuy: Money | null
  /** Requested scenario value before the engine caps any offer at max buy. */
  requestedProposedBuy?: Money
  proposedBuy?: Money
  projectedProfitRange: MoneyRange
  /** Midpoint ROI percentage, based on purchase price plus known costs. */
  roi: number
  roiPercent: number
  roiRange: MoneyRange
  confidence: ConfidenceLevel
  confidenceScore: number
  compCount: number
  normalizedComps: NormalizedComparable[]
  adjustments: Adjustment[]
  explanations: string[]
  warnings: string[]
  rejectReasons: string[]
  decision: UnderwritingDecision
  manualReviewRequired: boolean
  hardReject: boolean
  evidence: EvidenceReceipt[]
  economics: CalculationEconomics
}

export type SellerDraftStepKey =
  | 'availability'
  | 'condition-title'
  | 'negotiability'
  | 'evidence-offer'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface ApprovalMetadata {
  required: true
  status: ApprovalStatus
  approvedBy?: string
  approvedAt?: string
  note?: string
}

export interface SellerDraftStep {
  key: SellerDraftStepKey
  label: string
  objective: string
  prompt: string
  requiredFields: string[]
  approval: ApprovalMetadata
}

export type SellerDraftSequence = SellerDraftStep[]

export interface SellerDraftContext {
  sellerName?: string
  vehicle?: Pick<Vehicle, 'year' | 'make' | 'model'>
  proposedBuy?: Money
  maxBuy?: Money
}

export interface ValuationFixture {
  id: string
  vehicle: Vehicle
  comps: ComparableVehicle[]
  evidence: VehicleEvidence[]
  costs: UnderwritingCosts
  proposedBuy: Money
  alternateProposedBuy: Money
  underwriting: UnderwritingInput
}
