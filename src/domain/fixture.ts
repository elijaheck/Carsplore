import { calculateUnderwriting } from './valuation'
import type {
  ComparableVehicle,
  UnderwritingCosts,
  Vehicle,
  VehicleEvidence,
  ValuationFixture,
} from './types'

/**
 * A small, fully local 2007 Mazda 6-style flip case.  The prices are
 * intentionally ordinary manual entries rather than remote market data.
 */
export const mazda6FixtureVehicle: Vehicle = {
  year: 2007,
  make: 'Mazda',
  model: '6',
  trim: 'i Sport',
  mileage: 170_000,
  titleStatus: 'clean',
  titleInSellerName: true,
  history: {
    titleStatus: 'clean',
    titleInSellerName: true,
    accidentSeverity: 'none',
    minorRepairedAccident: false,
    structuralDamage: false,
    floodDamage: false,
    fireDamage: false,
    unresolvedAirbags: false,
    airbagsResolved: true,
  },
  condition: {
    drivability: 'clear',
    materialDrivabilityFault: false,
    reconNotes: 'Detail, fluids, and a safety check.',
  },
}

export const mazda6FixtureComps: ComparableVehicle[] = [
  {
    id: 'mazda6-comp-01',
    year: 2007,
    make: 'Mazda',
    model: '6',
    trim: 'i Sport',
    mileage: 169_500,
    price: 2_200,
    daysListed: 30,
    status: 'sold',
    source: 'manual listing note',
    capturedAt: '2026-08-14',
  },
  {
    id: 'mazda6-comp-02',
    year: 2007,
    make: 'Mazda',
    model: '6',
    trim: 'i Sport',
    mileage: 170_000,
    price: 2_300,
    daysListed: 30,
    status: 'sold',
    source: 'manual listing note',
    capturedAt: '2026-08-13',
  },
  {
    id: 'mazda6-comp-03',
    year: 2008,
    make: 'Mazda',
    model: '6',
    trim: 'i Sport',
    mileage: 170_000,
    price: 2_400,
    daysListed: 30,
    status: 'active',
    source: 'manual listing note',
    capturedAt: '2026-08-12',
  },
  {
    id: 'mazda6-comp-04',
    year: 2007,
    make: 'Mazda',
    model: '6',
    trim: 'i Sport',
    mileage: 170_500,
    price: 2_500,
    daysListed: 30,
    status: 'sold',
    source: 'manual listing note',
    capturedAt: '2026-08-11',
  },
]

export const mazda6FixtureEvidence: VehicleEvidence[] = [
  {
    id: 'evidence-kbb-mazda6',
    kind: 'kbb',
    source: 'KBB owner-entered value',
    capturedAt: '2026-08-15T15:00:00-07:00',
    value: 2_350,
    notes: 'User supplied reference only; not fetched by the app.',
  },
  {
    id: 'evidence-mmr-mazda6',
    kind: 'mmr',
    source: 'MMR owner-entered range',
    capturedAt: '2026-08-15T15:05:00-07:00',
    value: 2_300,
    notes: 'User supplied reference only; not fetched by the app.',
  },
  {
    id: 'evidence-carfax-mazda6',
    kind: 'carfax',
    source: 'CARFAX owner-entered history note',
    capturedAt: '2026-08-15T15:10:00-07:00',
    titleStatus: 'clean',
    notes: 'No accident or title-brand fact entered in this fixture.',
  },
]

export const mazda6FixtureCosts: UnderwritingCosts = {
  recon: 350,
  transport: 0,
  titleTaxTransaction: 0,
  riskReserve: 0,
  targetProfit: 500,
}

export const mazda6Fixture: ValuationFixture = {
  id: 'carsplore-mazda6-2007-demo',
  vehicle: mazda6FixtureVehicle,
  comps: mazda6FixtureComps,
  evidence: mazda6FixtureEvidence,
  costs: mazda6FixtureCosts,
  proposedBuy: 1_500,
  alternateProposedBuy: 1_800,
  underwriting: {
    vehicle: mazda6FixtureVehicle,
    comps: mazda6FixtureComps,
    evidence: mazda6FixtureEvidence,
    costs: mazda6FixtureCosts,
    proposedBuy: 1_500,
  },
}

/** Short names make the fixture convenient to import from a cockpit screen. */
export const fixture = mazda6Fixture
export const defaultFixture = mazda6Fixture

export const mazda6FixtureUnderwriting = calculateUnderwriting(mazda6Fixture.underwriting)

/** Underwrite the alternate offer without mutating the canonical fixture. */
export const mazda6FixtureAlternateUnderwriting = calculateUnderwriting({
  ...mazda6Fixture.underwriting,
  proposedBuy: mazda6Fixture.alternateProposedBuy,
})
