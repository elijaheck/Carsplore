import { useEffect, useMemo, useState } from 'react'
import { createSellerDraftSequence, calculateUnderwriting } from './domain/valuation'
import { defaultFixture } from './domain/fixture'
import { hasDollarAmountAbove, invalidateDraftApprovals, isCanonicalOfferDraft } from './approvals'
import type {
  AccidentSeverity,
  ApprovalStatus,
  ComparableVehicle,
  CompStatus,
  DrivabilityStatus,
  EvidenceKind,
  SellerDraftSequence,
  SellerDraftStep,
  TitleStatus,
  UnderwritingCosts,
  UnderwritingResult,
  Vehicle,
  VehicleCondition,
  VehicleEvidence,
  VehicleHistory,
} from './domain/types'
import { clearLocalState, loadLocalState, saveLocalState, wasLocalStateCleared } from './storage'

type JournalOutcome = 'viewed' | 'passed' | 'bought' | 'sold' | 'lesson'

interface JournalEntry {
  id: string
  timestamp: string
  outcome: JournalOutcome
  note: string
}

interface DraftEntry extends SellerDraftStep {
  text: string
}

interface AppState {
  vehicle: Vehicle
  comps: ComparableVehicle[]
  evidence: VehicleEvidence[]
  costs: UnderwritingCosts
  proposedBuy?: number
  drafts: DraftEntry[]
  journal: JournalEntry[]
}

interface Bootstrap {
  state: AppState
  hasSavedState: boolean
  wasCleared: boolean
}

const COST_FIELDS: Array<{
  key: keyof UnderwritingCosts
  label: string
  detail: string
}> = [
  { key: 'recon', label: 'Recon', detail: 'Known repair, detail, and safety work' },
  { key: 'transport', label: 'Transport', detail: 'Move the vehicle to the operating location' },
  { key: 'titleTaxTransaction', label: 'Title / tax / transaction', detail: 'Known acquisition and transfer costs' },
  { key: 'riskReserve', label: 'Risk reserve', detail: 'Buffer for bounded uncertainty' },
  { key: 'targetProfit', label: 'Target profit', detail: 'Minimum profit hurdle' },
]

const EVIDENCE_KINDS: EvidenceKind[] = ['kbb', 'mmr', 'carfax', 'inspection', 'seller', 'other']
const COMP_STATUSES: CompStatus[] = ['sold', 'active', 'pending', 'expired', 'unknown']
const TITLE_STATUSES: TitleStatus[] = [
  'clean',
  'clean-title',
  'repaired',
  'repaired-title',
  'salvage',
  'salvage-title',
  'branded',
  'branded-title',
  'flood',
  'flood-title',
  'fire',
  'fire-title',
  'structural',
  'structural-title',
  'rebuilt',
  'reconstructed',
  'unknown',
]
const ACCIDENT_SEVERITIES: AccidentSeverity[] = [
  'none',
  'minor',
  'minor-repaired',
  'moderate',
  'major',
  'unknown',
]
const DRIVABILITY_STATUSES: DrivabilityStatus[] = ['clear', 'unknown', 'minor-fault', 'material-fault']
const JOURNAL_OUTCOMES: JournalOutcome[] = ['viewed', 'passed', 'bought', 'sold', 'lesson']

function makeId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    const random = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${prefix}-${random}`
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function parseNumber(value: string): number {
  if (!value.trim()) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : undefined
}

function formatMoney(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—'
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100
  const sign = rounded < 0 ? '-' : ''
  return `${sign}$${Math.abs(rounded).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

function formatPercent(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
}

function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function triState(value: boolean | undefined): 'yes' | 'no' | 'unknown' {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown'
}

function triStateValue(value: string): boolean | undefined {
  return value === 'yes' ? true : value === 'no' ? false : undefined
}

function draftEntries(sequence: SellerDraftSequence): DraftEntry[] {
  return sequence.map((step) => ({ ...step, text: step.prompt }))
}

function draftContext(state: Pick<AppState, 'vehicle' | 'proposedBuy'>, result?: UnderwritingResult) {
  return {
    sellerName: state.vehicle.sellerName,
    vehicle: {
      year: state.vehicle.year,
      make: state.vehicle.make,
      model: state.vehicle.model,
    },
    proposedBuy: result?.proposedBuy ?? state.proposedBuy,
    maxBuy: result?.maxBuy,
  }
}

function createFixtureState(): AppState {
  const fixture = clone(defaultFixture)
  const vehicle = clone(fixture.vehicle)
  const state: AppState = {
    vehicle,
    comps: clone(fixture.comps),
    evidence: clone(fixture.evidence),
    costs: clone(fixture.costs),
    proposedBuy: fixture.proposedBuy,
    drafts: [],
    journal: [],
  }
  state.drafts = draftEntries(createSellerDraftSequence(draftContext(state)))
  return state
}

function createEmptyState(): AppState {
  const state: AppState = {
    vehicle: {
      year: 0,
      make: '',
      model: '',
      trim: '',
      mileage: 0,
      history: {},
      condition: {},
    },
    comps: [],
    evidence: [],
    costs: {
      recon: 0,
      transport: 0,
      titleTaxTransaction: 0,
      riskReserve: 0,
      targetProfit: 0,
    },
    proposedBuy: undefined,
    drafts: [],
    journal: [],
  }
  state.drafts = draftEntries(createSellerDraftSequence(draftContext(state)))
  return state
}

function hydrateState(value: unknown): AppState {
  const candidate = (value ?? {}) as Partial<AppState>
  const empty = createEmptyState()
  const candidateVehicle = (candidate.vehicle ?? {}) as Partial<Vehicle>
  const candidateHistory = (candidateVehicle.history ?? {}) as VehicleHistory
  const candidateCondition = (candidateVehicle.condition ?? {}) as VehicleCondition
  const vehicle: Vehicle = {
    ...empty.vehicle,
    ...candidateVehicle,
    history: { ...empty.vehicle.history, ...candidateHistory },
    condition: { ...empty.vehicle.condition, ...candidateCondition },
  }
  const comps = Array.isArray(candidate.comps) ? clone(candidate.comps) : []
  const evidence = Array.isArray(candidate.evidence) ? clone(candidate.evidence) : []
  const costs = { ...empty.costs, ...(candidate.costs ?? {}) }
  const proposedBuy = candidate.proposedBuy
  const hydratedUnderwriting = calculateUnderwriting({
    vehicle,
    comps,
    evidence,
    costs,
    proposedBuy,
  })
  const base: AppState = {
    ...empty,
    ...candidate,
    vehicle,
    comps,
    evidence,
    costs,
    proposedBuy,
    drafts: draftEntries(
      createSellerDraftSequence(
        draftContext({ vehicle, proposedBuy }, hydratedUnderwriting),
      ),
    ),
    journal: Array.isArray(candidate.journal) ? clone(candidate.journal) : [],
  }
  return base
}

function titleValue(vehicle: Vehicle): TitleStatus {
  return vehicle.history?.titleStatus ?? vehicle.titleStatus ?? 'unknown'
}

function historyBoolean(vehicle: Vehicle, key: keyof VehicleHistory): boolean | undefined {
  const history = vehicle.history
  const value = history?.[key]
  if (typeof value === 'boolean') return value
  const alias = vehicle[key as keyof Vehicle]
  return typeof alias === 'boolean' ? alias : undefined
}

function historyAliasPatch(patch: Partial<VehicleHistory>): Partial<Vehicle> {
  const alias: Partial<Vehicle> = {}
  if ('titleStatus' in patch) alias.titleStatus = patch.titleStatus
  if ('titleInSellerName' in patch) alias.titleInSellerName = patch.titleInSellerName
  if ('minorRepairedAccident' in patch) alias.minorRepairedAccident = patch.minorRepairedAccident
  if ('accidentSeverity' in patch) alias.accidentSeverity = patch.accidentSeverity
  if ('structuralDamage' in patch) alias.structuralDamage = patch.structuralDamage
  if ('floodDamage' in patch) alias.floodDamage = patch.floodDamage
  if ('fireDamage' in patch) alias.fireDamage = patch.fireDamage
  if ('unresolvedAirbags' in patch) alias.unresolvedAirbags = patch.unresolvedAirbags
  return alias
}

function statusClass(decision: UnderwritingResult['decision']): string {
  return decision === 'go' ? 'go' : decision === 'hard-reject' ? 'hard-reject' : 'manual-review'
}

interface TriStateSelectProps {
  id: string
  label: string
  value: boolean | undefined
  onChange: (value: boolean | undefined) => void
  help?: string
}

function TriStateSelect({ id, label, value, onChange, help }: TriStateSelectProps) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      <select id={id} value={triState(value)} onChange={(event) => onChange(triStateValue(event.target.value))}>
        <option value="unknown">Unknown / not verified</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      {help ? <span className="field-help">{help}</span> : null}
    </label>
  )
}

function SectionHeading({ id, index, eyebrow, title, note }: { id: string; index: string; eyebrow: string; title: string; note?: string }) {
  return (
    <div className="section-heading">
      <div className="section-heading-main">
        <span className="section-index">{index}</span>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id={id}>{title}</h2>
        </div>
      </div>
      {note ? <span className="section-note">{note}</span> : null}
    </div>
  )
}

function App() {
  const [bootstrap] = useState<Bootstrap>(() => {
    const saved = loadLocalState<unknown | null>(null)
    if (saved) return { state: hydrateState(saved), hasSavedState: true, wasCleared: false }
    const wasCleared = wasLocalStateCleared()
    return {
      state: wasCleared ? createEmptyState() : createFixtureState(),
      hasSavedState: false,
      wasCleared,
    }
  })
  const [state, setState] = useState<AppState>(bootstrap.state)
  const [persistenceEnabled, setPersistenceEnabled] = useState(bootstrap.hasSavedState)
  const [notice, setNotice] = useState('')
  const [clearArmed, setClearArmed] = useState(false)
  const [journalOutcome, setJournalOutcome] = useState<JournalOutcome>('viewed')
  const [journalNote, setJournalNote] = useState('')

  useEffect(() => {
    if (persistenceEnabled) saveLocalState(state)
  }, [persistenceEnabled, state])

  const underwriting = useMemo(
    () => calculateUnderwriting({
      vehicle: state.vehicle,
      comps: state.comps,
      evidence: state.evidence,
      costs: state.costs,
      proposedBuy: state.proposedBuy,
    }),
    [state],
  )
  const normalizedById = useMemo(
    () => new Map(underwriting.normalizedComps.map((comp) => [comp.id, comp])),
    [underwriting.normalizedComps],
  )
  const approvedMaxBuy = underwriting.decision === 'go'
    ? underwriting.approvedMaxBuy ?? underwriting.maxBuy
    : null
  const canonicalOfferDraftText = createSellerDraftSequence(draftContext(state, underwriting))
    .find((draft) => draft.key === 'evidence-offer')?.prompt ?? ''

  const commit = (updater: (previous: AppState) => AppState) => {
    setPersistenceEnabled(true)
    setState(updater)
    setNotice('Saved locally in this browser.')
  }

  const commitInputEdit = (updater: (previous: AppState) => AppState) => {
    commit((previous) => {
      const updated = updater(previous)
      return { ...updated, drafts: invalidateDraftApprovals(updated.drafts) }
    })
  }

  const updateVehicle = (patch: Partial<Vehicle>) => {
    commitInputEdit((previous) => ({ ...previous, vehicle: { ...previous.vehicle, ...patch } }))
  }

  const updateHistory = (patch: Partial<VehicleHistory>) => {
    commitInputEdit((previous) => ({
      ...previous,
      vehicle: {
        ...previous.vehicle,
        ...historyAliasPatch(patch),
        history: { ...previous.vehicle.history, ...patch },
      },
    }))
  }

  const updateCondition = (patch: Partial<VehicleCondition>) => {
    commitInputEdit((previous) => ({
      ...previous,
      vehicle: {
        ...previous.vehicle,
        ...(Object.prototype.hasOwnProperty.call(patch, 'materialDrivabilityFault')
          ? { materialDrivabilityFault: patch.materialDrivabilityFault }
          : {}),
        condition: { ...previous.vehicle.condition, ...patch },
      },
    }))
  }

  const updateCost = (key: keyof UnderwritingCosts, value: number) => {
    commitInputEdit((previous) => ({ ...previous, costs: { ...previous.costs, [key]: Math.max(0, value) } }))
  }

  const updateEvidence = (id: string, patch: Partial<VehicleEvidence>) => {
    commitInputEdit((previous) => ({
      ...previous,
      evidence: previous.evidence.map((item) => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  const addEvidence = () => {
    const id = makeId('evidence')
    commitInputEdit((previous) => ({
      ...previous,
      evidence: [
        ...previous.evidence,
        { id, kind: 'other', source: '', capturedAt: '', value: undefined, notes: '' },
      ],
    }))
  }

  const removeEvidence = (id: string) => {
    commitInputEdit((previous) => ({ ...previous, evidence: previous.evidence.filter((item) => item.id !== id) }))
  }

  const updateComp = (id: string, patch: Partial<ComparableVehicle>) => {
    commitInputEdit((previous) => ({
      ...previous,
      comps: previous.comps.map((item) => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  const addComp = () => {
    const id = makeId('comp')
    commitInputEdit((previous) => ({
      ...previous,
      comps: [
        ...previous.comps,
        {
          id,
          year: previous.vehicle.year || undefined,
          make: previous.vehicle.make || undefined,
          model: previous.vehicle.model || undefined,
          mileage: previous.vehicle.mileage,
          price: 0,
          daysListed: 30,
          status: 'unknown',
          source: '',
          capturedAt: '',
          notes: '',
        },
      ],
    }))
  }

  const removeComp = (id: string) => {
    commitInputEdit((previous) => ({ ...previous, comps: previous.comps.filter((item) => item.id !== id) }))
  }

  const updateDraftText = (key: string, text: string) => {
    commitInputEdit((previous) => ({
      ...previous,
      drafts: previous.drafts.map((draft) => draft.key === key ? { ...draft, text } : draft),
    }))
  }

  const updateDraftApproval = (key: string, status: ApprovalStatus) => {
    const matchingDrafts = state.drafts.filter((item) => item.key === key)
    const draft = matchingDrafts.length === 1 ? matchingDrafts[0] : undefined
    const duplicateDraftKey = matchingDrafts.length !== 1
    const editedOfferExceedsMax =
      key === 'evidence-offer' &&
      draft !== undefined &&
      hasDollarAmountAbove(draft.text, underwriting.maxBuy)
    const offerDraftIsCanonical =
      key !== 'evidence-offer' ||
      (draft !== undefined && isCanonicalOfferDraft(draft.text, canonicalOfferDraftText))
    if (
      key === 'evidence-offer' &&
      status === 'approved' &&
      (underwriting.decision !== 'go' || editedOfferExceedsMax || !offerDraftIsCanonical || duplicateDraftKey)
    ) {
      setNotice(
        duplicateDraftKey
          ? 'Offer review stays pending because draft state is malformed; regenerate canonical drafts.'
          : !offerDraftIsCanonical
          ? 'Offer review stays pending because offer copy was edited; regenerate the canonical capped draft.'
          : editedOfferExceedsMax
            ? 'Offer review stays pending because the edited draft contains an amount above max buy.'
            : 'Offer review stays pending until the underwriting gate is GO.',
      )
      return
    }
    commit((previous) => ({
      ...previous,
      drafts: previous.drafts.map((draft) => draft.key === key
        ? {
            ...draft,
            approval: status === 'approved'
              ? {
                  required: true,
                  status,
                  approvedBy: 'local operator',
                  approvedAt: new Date().toISOString(),
                }
              : { required: true, status },
          }
        : draft),
    }))
  }

  const regenerateDrafts = () => {
    commit((previous) => ({
      ...previous,
      drafts: draftEntries(createSellerDraftSequence(draftContext(previous, underwriting))),
    }))
    setNotice('Drafts regenerated from current local inputs. They remain unsent.')
  }

  const addJournalEntry = () => {
    const note = journalNote.trim()
    if (!note) {
      setNotice('Add a short note before recording an outcome.')
      return
    }
    commit((previous) => ({
      ...previous,
      journal: [
        {
          id: makeId('journal'),
          timestamp: new Date().toISOString(),
          outcome: journalOutcome,
          note,
        },
        ...previous.journal,
      ],
    }))
    setJournalNote('')
  }

  const deleteJournalEntry = (id: string) => {
    commit((previous) => ({ ...previous, journal: previous.journal.filter((entry) => entry.id !== id) }))
  }

  const resetFixture = () => {
    setClearArmed(false)
    setPersistenceEnabled(true)
    setState(createFixtureState())
    setNotice('Fictional Mazda 6 fixture restored and saved as the local draft.')
  }

  const clearData = () => {
    if (!clearArmed) {
      setClearArmed(true)
      setNotice('Clear is ready. Press “Confirm clear” to remove Carsplore local data.')
      return
    }
    clearLocalState()
    setPersistenceEnabled(false)
    setState(createEmptyState())
    setClearArmed(false)
    setNotice('Local data cleared. This is a clean first-run state; the fixture will not return unless you reset it.')
  }

  const titleStatus = titleValue(state.vehicle)
  const history = state.vehicle.history ?? {}
  const condition = state.vehicle.condition ?? {}

  return (
    <div className="app-shell">
      <header className="editorial-header">
        <div className="brand-lockup">
          <p className="brand-kicker">CARS / PLORE <span>01</span></p>
          <h1>Deal sheet for the next <em>smart</em> buy.</h1>
          <p className="lede">A local-first inspection bay for turning manually observed facts into a reviewable vehicle-flip decision.</p>
        </div>
        <div className="header-meta">
          <div className="header-flag"><span className="flag-dot" /> LOCAL-ONLY</div>
          <div className="header-flag">FICTIONAL FIXTURE / MANUAL EVIDENCE</div>
          <div className="header-flag">NO LIVE PROVIDERS</div>
          <p className="header-caption">No authentication, scraping, lookup, send, or cloud sync is connected to this cockpit.</p>
        </div>
      </header>

      <div className="status-strip" role="status" aria-live="polite">
        <div><span className="strip-label">WORKSPACE</span><strong>LOCAL DEAL / {state.vehicle.year || '—'} {state.vehicle.make || 'Untitled'} {state.vehicle.model || ''}</strong></div>
        <div><span className="strip-label">EVIDENCE</span><strong>{state.evidence.length} operator-entered row{state.evidence.length === 1 ? '' : 's'}</strong></div>
        <div><span className="strip-label">COMPS</span><strong>{underwriting.compCount} normalized</strong></div>
        <div className={`decision-pill decision-${statusClass(underwriting.decision)}`}><span className="decision-mark" /> {titleCase(underwriting.decision)}</div>
      </div>

      <div className="toolbar">
        <p className="toolbar-note" role="status" aria-live="polite" aria-atomic="true">{notice || (bootstrap.hasSavedState ? 'Loaded from this browser’s local draft.' : bootstrap.wasCleared ? 'Local data was cleared; reset the fixture to restore the example.' : 'Fixture loaded for orientation; edits are saved locally.')}</p>
        <div className="toolbar-actions">
          <button type="button" className="button button-secondary" onClick={resetFixture}>Reset fixture</button>
          <button type="button" className="button button-danger" onClick={clearData}>{clearArmed ? 'Confirm clear' : 'Clear local data'}</button>
          {clearArmed ? <button type="button" className="button button-quiet" onClick={() => setClearArmed(false)}>Cancel</button> : null}
        </div>
      </div>

      <main className="app-grid">
        <div className="main-column">
          <section className="panel" aria-labelledby="deal-inputs-title">
            <SectionHeading id="deal-inputs-title" index="01" eyebrow="Intake / operator entry" title="Deal inputs" note="All values are editable" />
            <p className="section-intro">Start with the listing as you observed it. These fields are local notes, not a provider record.</p>
            <div className="field-grid field-grid-three">
              <label className="field" htmlFor="vehicle-year"><span className="field-label">Year</span><input id="vehicle-year" type="number" min="0" step="1" value={state.vehicle.year || ''} onChange={(event) => updateVehicle({ year: parseNumber(event.target.value) })} /></label>
              <label className="field" htmlFor="vehicle-make"><span className="field-label">Make</span><input id="vehicle-make" type="text" value={state.vehicle.make} onChange={(event) => updateVehicle({ make: event.target.value })} /></label>
              <label className="field" htmlFor="vehicle-model"><span className="field-label">Model</span><input id="vehicle-model" type="text" value={state.vehicle.model} onChange={(event) => updateVehicle({ model: event.target.value })} /></label>
              <label className="field" htmlFor="vehicle-trim"><span className="field-label">Trim / package <small>optional</small></span><input id="vehicle-trim" type="text" value={state.vehicle.trim ?? ''} onChange={(event) => updateVehicle({ trim: event.target.value })} /></label>
              <label className="field" htmlFor="vehicle-mileage"><span className="field-label">Mileage</span><input id="vehicle-mileage" type="number" min="0" step="100" value={state.vehicle.mileage || ''} onChange={(event) => updateVehicle({ mileage: parseNumber(event.target.value) })} /></label>
              <label className="field" htmlFor="seller-name"><span className="field-label">Seller name <small>optional</small></span><input id="seller-name" type="text" value={state.vehicle.sellerName ?? ''} onChange={(event) => updateVehicle({ sellerName: event.target.value })} /></label>
            </div>
            <div className="buy-band">
              <label className="field field-buy" htmlFor="proposed-buy"><span className="field-label">Proposed buy</span><input id="proposed-buy" type="number" min="0" step="50" placeholder="Not entered" value={state.proposedBuy ?? ''} onChange={(event) => commitInputEdit((previous) => ({ ...previous, proposedBuy: parseOptionalNumber(event.target.value) }))} /></label>
              <div className="buy-band-copy"><span className="eyebrow">Scenario input</span><strong>What you would actually pay</strong><p>Used for projected profit and ROI. It does not rewrite the deterministic max-buy gate.</p></div>
            </div>
            <div className="costs-heading"><div><p className="eyebrow">Editable cost stack</p><h3>Underwriting costs</h3></div><span className="mono-note">Non-acquisition costs are explicit</span></div>
            <div className="field-grid field-grid-five">
              {COST_FIELDS.map((cost) => <label className="field" htmlFor={`cost-${cost.key}`} key={cost.key}><span className="field-label">{cost.label}</span><input id={`cost-${cost.key}`} type="number" min="0" step="25" value={state.costs[cost.key]} onChange={(event) => updateCost(cost.key, parseNumber(event.target.value))} /><span className="field-help">{cost.detail}</span></label>)}
            </div>
          </section>

          <section className="panel" aria-labelledby="evidence-title">
            <SectionHeading id="evidence-title" index="02" eyebrow="Manual evidence / no fetch" title="Valuation evidence" note="Operator-entered / unverified" />
            <p className="section-intro">KBB, MMR, CARFAX-like, inspection, and seller facts stay attached to their source and capture time. They are not live or provider-verified.</p>
            <div className="editor-list">
              {state.evidence.length === 0 ? <div className="empty-row"><span className="empty-mark">+</span><div><strong>No evidence rows yet.</strong><p>Add what you personally observed, with a source and timestamp.</p></div></div> : state.evidence.map((item, index) => <article className="editor-card evidence-card" key={item.id}>
                <div className="card-topline"><span className="row-number">EV / {String(index + 1).padStart(2, '0')}</span><span className="unverified-badge">manual · unverified</span><button type="button" className="icon-button" aria-label={`Remove evidence row ${index + 1}`} onClick={() => removeEvidence(item.id)}>×</button></div>
                <div className="field-grid field-grid-evidence">
                  <label className="field" htmlFor={`evidence-kind-${item.id}`}><span className="field-label">Kind</span><select id={`evidence-kind-${item.id}`} value={item.kind} onChange={(event) => updateEvidence(item.id, { kind: event.target.value as EvidenceKind })}>{EVIDENCE_KINDS.map((kind) => <option value={kind} key={kind}>{kind.toUpperCase()}</option>)}</select></label>
                  <label className="field" htmlFor={`evidence-source-${item.id}`}><span className="field-label">Source / reference</span><input id={`evidence-source-${item.id}`} type="text" value={item.source} placeholder="e.g. owner-entered KBB note" onChange={(event) => updateEvidence(item.id, { source: event.target.value })} /></label>
                  <label className="field" htmlFor={`evidence-captured-${item.id}`}><span className="field-label">Captured at</span><input id={`evidence-captured-${item.id}`} type="text" value={item.capturedAt} placeholder="ISO date or local note" onChange={(event) => updateEvidence(item.id, { capturedAt: event.target.value })} /></label>
                  <label className="field" htmlFor={`evidence-value-${item.id}`}><span className="field-label">Value <small>optional</small></span><input id={`evidence-value-${item.id}`} type="number" min="0" step="50" value={item.value ?? ''} onChange={(event) => updateEvidence(item.id, { value: parseOptionalNumber(event.target.value) })} /></label>
                  <label className="field field-span-two" htmlFor={`evidence-notes-${item.id}`}><span className="field-label">Notes</span><textarea id={`evidence-notes-${item.id}`} rows={2} value={item.notes ?? ''} onChange={(event) => updateEvidence(item.id, { notes: event.target.value })} /></label>
                </div>
              </article>)}
            </div>
            <button type="button" className="button button-add" onClick={addEvidence}>+ Add evidence row</button>
          </section>

          <section className="panel" aria-labelledby="comps-title">
            <SectionHeading id="comps-title" index="03" eyebrow="Manual market set / explainable" title="Comparable listings" note="Active and sold, by hand" />
            <p className="section-intro">Enter each listing with its source and retrieval timestamp. The engine normalizes mileage, days listed, and status weight below; it does not fetch or validate the listing.</p>
            <div className="editor-list">
              {state.comps.length === 0 ? <div className="empty-row"><span className="empty-mark">+</span><div><strong>No comparable listings yet.</strong><p>A quick-sale value remains unavailable until a valid manual comp is entered.</p></div></div> : state.comps.map((item, index) => {
                const normalized = normalizedById.get(item.id)
                return <article className="editor-card comp-card" key={item.id}>
                  <div className="card-topline"><span className="row-number">COMP / {String(index + 1).padStart(2, '0')}</span><span className={`comp-status comp-status-${item.status}`}>{titleCase(item.status)}</span><button type="button" className="icon-button" aria-label={`Remove comparable ${index + 1}`} onClick={() => removeComp(item.id)}>×</button></div>
                  <div className="field-grid field-grid-comp">
                    <label className="field" htmlFor={`comp-status-${item.id}`}><span className="field-label">Status</span><select id={`comp-status-${item.id}`} value={item.status} onChange={(event) => updateComp(item.id, { status: event.target.value as CompStatus })}>{COMP_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
                    <label className="field" htmlFor={`comp-year-${item.id}`}><span className="field-label">Year</span><input id={`comp-year-${item.id}`} type="number" min="0" step="1" value={item.year ?? ''} onChange={(event) => updateComp(item.id, { year: parseOptionalNumber(event.target.value) })} /></label>
                    <label className="field" htmlFor={`comp-make-${item.id}`}><span className="field-label">Make</span><input id={`comp-make-${item.id}`} type="text" value={item.make ?? ''} onChange={(event) => updateComp(item.id, { make: event.target.value })} /></label>
                    <label className="field" htmlFor={`comp-model-${item.id}`}><span className="field-label">Model</span><input id={`comp-model-${item.id}`} type="text" value={item.model ?? ''} onChange={(event) => updateComp(item.id, { model: event.target.value })} /></label>
                    <label className="field" htmlFor={`comp-mileage-${item.id}`}><span className="field-label">Mileage</span><input id={`comp-mileage-${item.id}`} type="number" min="0" step="100" value={item.mileage} onChange={(event) => updateComp(item.id, { mileage: parseNumber(event.target.value) })} /></label>
                    <label className="field" htmlFor={`comp-price-${item.id}`}><span className="field-label">Price</span><input id={`comp-price-${item.id}`} type="number" min="0" step="50" value={item.price} onChange={(event) => updateComp(item.id, { price: parseNumber(event.target.value) })} /></label>
                    <label className="field" htmlFor={`comp-days-${item.id}`}><span className="field-label">Days listed</span><input id={`comp-days-${item.id}`} type="number" min="0" step="1" value={item.daysListed} onChange={(event) => updateComp(item.id, { daysListed: parseNumber(event.target.value) })} /></label>
                    <label className="field" htmlFor={`comp-source-${item.id}`}><span className="field-label">Source</span><input id={`comp-source-${item.id}`} type="text" value={item.source ?? ''} placeholder="Manual listing note" onChange={(event) => updateComp(item.id, { source: event.target.value })} /></label>
                    <label className="field" htmlFor={`comp-captured-${item.id}`}><span className="field-label">Captured at</span><input id={`comp-captured-${item.id}`} type="text" value={item.capturedAt ?? ''} placeholder="ISO date or local note" onChange={(event) => updateComp(item.id, { capturedAt: event.target.value })} /></label>
                    <label className="field field-span-two" htmlFor={`comp-notes-${item.id}`}><span className="field-label">Notes</span><textarea id={`comp-notes-${item.id}`} rows={2} value={item.notes ?? ''} onChange={(event) => updateComp(item.id, { notes: event.target.value })} /></label>
                  </div>
                  {normalized ? <div className="normalization-note"><span className="normalization-label">ENGINE NORMALIZATION</span><strong>{formatMoney(normalized.normalizedPrice)}</strong><p>{normalized.explanation}</p></div> : <div className="normalization-note normalization-invalid"><span className="normalization-label">WAITING FOR VALID COMP</span><p>Enter a positive price, nonnegative mileage and days listed, source, and capture time to include this comp.</p></div>}
                </article>
              })}
            </div>
            <button type="button" className="button button-add" onClick={addComp}>+ Add comparable</button>
          </section>

          <section className="panel" aria-labelledby="risk-title">
            <SectionHeading id="risk-title" index="04" eyebrow="Policy / inspect before offer" title="Risk review" note="Unknown stays unknown" />
            <p className="section-intro">These controls describe what is known, not what is assumed. Unknown evidence is kept as unknown and can force manual review.</p>
            <div className="risk-grid">
              <label className="field" htmlFor="title-status"><span className="field-label">Title status</span><select id="title-status" value={titleStatus} onChange={(event) => updateHistory({ titleStatus: event.target.value === 'unknown' ? undefined : event.target.value as TitleStatus })}>{TITLE_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select><span className="field-help">Never infer a clean title from missing evidence.</span></label>
              <TriStateSelect id="title-in-seller-name" label="Title in seller name" value={history.titleInSellerName ?? state.vehicle.titleInSellerName} onChange={(value) => updateHistory({ titleInSellerName: value })} help="Confirm from a title photo or direct observation." />
              <label className="field" htmlFor="accident-severity"><span className="field-label">Accident severity</span><select id="accident-severity" value={history.accidentSeverity ?? state.vehicle.accidentSeverity ?? 'unknown'} onChange={(event) => updateHistory({ accidentSeverity: event.target.value === 'unknown' ? undefined : event.target.value as AccidentSeverity })}>{ACCIDENT_SEVERITIES.map((severity) => <option key={severity} value={severity}>{titleCase(severity)}</option>)}</select></label>
              <TriStateSelect id="minor-repaired-accident" label="Minor repaired accident" value={history.minorRepairedAccident ?? state.vehicle.minorRepairedAccident} onChange={(value) => updateHistory({ minorRepairedAccident: value })} help="A bounded adjustment plus inspection flag, not an automatic reject." />
              <TriStateSelect id="structural-damage" label="Structural damage" value={historyBoolean(state.vehicle, 'structuralDamage')} onChange={(value) => updateHistory({ structuralDamage: value })} />
              <TriStateSelect id="flood-damage" label="Flood damage" value={historyBoolean(state.vehicle, 'floodDamage')} onChange={(value) => updateHistory({ floodDamage: value })} />
              <TriStateSelect id="fire-damage" label="Fire damage" value={historyBoolean(state.vehicle, 'fireDamage')} onChange={(value) => updateHistory({ fireDamage: value })} />
              <TriStateSelect id="unresolved-airbags" label="Unresolved airbags" value={historyBoolean(state.vehicle, 'unresolvedAirbags')} onChange={(value) => updateHistory({ unresolvedAirbags: value, airbagsResolved: value === undefined ? undefined : !value })} />
              <label className="field" htmlFor="drivability"><span className="field-label">Drivability</span><select id="drivability" value={condition.drivability ?? 'unknown'} onChange={(event) => updateCondition({ drivability: event.target.value as DrivabilityStatus })}>{DRIVABILITY_STATUSES.map((status) => <option key={status} value={status}>{titleCase(status)}</option>)}</select></label>
              <TriStateSelect id="material-fault" label="Material drivability fault" value={condition.materialDrivabilityFault ?? state.vehicle.materialDrivabilityFault} onChange={(value) => updateCondition({ materialDrivabilityFault: value })} help="Engine, transmission, unsafe braking, or similar hard-stop fault." />
              <label className="field field-span-two" htmlFor="recon-notes"><span className="field-label">Condition / inspection notes</span><textarea id="recon-notes" rows={3} value={condition.reconNotes ?? ''} onChange={(event) => updateCondition({ reconNotes: event.target.value })} /></label>
              <label className="field field-span-two" htmlFor="history-notes"><span className="field-label">History notes</span><textarea id="history-notes" rows={3} value={history.notes ?? ''} onChange={(event) => updateHistory({ notes: event.target.value })} /></label>
            </div>
          </section>

          <section className="panel" aria-labelledby="journal-title">
            <SectionHeading id="journal-title" index="05" eyebrow="Local memory / manual outcome" title="Outcome journal" note="No external writes" />
            <p className="section-intro">Record what happened after a review. Entries are timestamped locally in this browser and stay attached to this deal sheet.</p>
            <div className="journal-compose">
              <label className="field" htmlFor="journal-outcome"><span className="field-label">Outcome</span><select id="journal-outcome" value={journalOutcome} onChange={(event) => setJournalOutcome(event.target.value as JournalOutcome)}>{JOURNAL_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{titleCase(outcome)}</option>)}</select></label>
              <label className="field journal-note-field" htmlFor="journal-note"><span className="field-label">Note</span><input id="journal-note" type="text" value={journalNote} placeholder="What did you learn or decide?" onChange={(event) => setJournalNote(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addJournalEntry() }} /></label>
              <button type="button" className="button button-primary" onClick={addJournalEntry}>Record outcome</button>
            </div>
            <div className="journal-list">
              {state.journal.length === 0 ? <div className="empty-row journal-empty"><span className="empty-mark">·</span><div><strong>No outcomes recorded.</strong><p>Viewed, passed, bought, sold, and lessons can live here as local notes.</p></div></div> : state.journal.map((entry) => <article className="journal-entry" key={entry.id}><div className="journal-entry-meta"><span className={`journal-chip journal-${entry.outcome}`}>{titleCase(entry.outcome)}</span><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleString()}</time></div><p>{entry.note}</p><button type="button" className="icon-button" aria-label={`Delete ${entry.outcome} journal entry`} onClick={() => deleteJournalEntry(entry.id)}>×</button></article>)}
            </div>
          </section>
        </div>

        <aside className="underwriting-rail" aria-label="Underwriting output">
          <section className={`gate-panel gate-${statusClass(underwriting.decision)}`} aria-labelledby="gate-title">
            <div className="rail-kicker"><span>LIVE MODEL</span><span className="rail-rule" /><span>{underwriting.confidence.toUpperCase()} CONFIDENCE</span></div>
            <p className="eyebrow">Underwriting gate</p>
            <h2 id="gate-title">{titleCase(underwriting.decision)}</h2>
            <p className="gate-copy">{underwriting.decision === 'go' ? 'The modeled buy is inside the current policy gate. Human approval is still required before any seller draft is used.' : underwriting.decision === 'hard-reject' ? 'A hard-stop fact is present. There is no approved maximum buy until a human resolves and re-runs the review.' : 'A fact is missing, bounded, or unconfirmed. Treat the modeled number as an analysis aid, not an approved offer.'}</p>
            <div className="gate-number-label">APPROVED MAX BUY</div>
            <div className="gate-number">{formatMoney(approvedMaxBuy)}</div>
            <div className="gate-subline">{approvedMaxBuy === null ? 'BLOCKED / MANUAL REVIEW' : 'Human review required before offer'}</div>
          </section>

          <section className="rail-panel" aria-labelledby="output-title">
            <div className="rail-panel-heading"><div><p className="eyebrow">06 / Deterministic math</p><h2 id="output-title">Underwriting output</h2></div><span className={`confidence-tag confidence-${underwriting.confidence}`}>{underwriting.confidence} · {Math.round(underwriting.confidenceScore * 100)}%</span></div>
            <div className="metric-grid">
              <div className="metric"><span>Quick-sale</span><strong>{underwriting.compCount ? formatMoney(underwriting.quickSale) : '—'}</strong><small>weighted normalized midpoint</small></div>
              <div className="metric"><span>Expected retail</span><strong>{underwriting.compCount ? `${formatMoney(underwriting.expectedRetailRange.low)}–${formatMoney(underwriting.expectedRetailRange.high)}` : '—'}</strong><small>rounded normalized comp spread</small></div>
              <div className="metric"><span>Raw modeled max buy</span><strong>{formatMoney(underwriting.maxBuy)}</strong><small>not approval when blocked</small></div>
              <div className="metric"><span>Projected profit</span><strong>{formatMoney(underwriting.projectedProfitRange.midpoint)}</strong><small>{formatMoney(underwriting.projectedProfitRange.low)}–{formatMoney(underwriting.projectedProfitRange.high)}</small></div>
              <div className="metric"><span>Projected ROI</span><strong>{formatPercent(underwriting.roi)}</strong><small>scenario at proposed buy</small></div>
              <div className="metric"><span>Valid comps</span><strong>{underwriting.compCount}</strong><small>manual rows in model</small></div>
            </div>
            <div className="formula-card"><div className="formula-label">MAXIMUM BUY / TRANSPARENT FORMULA</div><p><strong>{formatMoney(underwriting.quickSale)}</strong><span>−</span><strong>{formatMoney(underwriting.economics.recon)}</strong><span>−</span><strong>{formatMoney(underwriting.economics.transport)}</strong><span>−</span><strong>{formatMoney(underwriting.economics.titleTaxTransaction)}</strong><span>−</span><strong>{formatMoney(underwriting.economics.riskReserve)}</strong><span>−</span><strong>{formatMoney(underwriting.economics.targetProfit)}</strong><span>=</span><strong className="formula-result">{formatMoney(underwriting.maxBuy)}</strong></p><small>quick-sale − recon − transport − title/tax/transaction − risk reserve − target profit</small></div>
          </section>

          <section className="rail-panel findings-panel" aria-labelledby="findings-title">
            <div className="rail-panel-heading"><div><p className="eyebrow">Gate notes</p><h2 id="findings-title">Warnings &amp; explanations</h2></div></div>
            {underwriting.rejectReasons.length ? <div className="finding-group finding-reject"><h3>Hard stops</h3><ul>{underwriting.rejectReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : null}
            {underwriting.warnings.length ? <div className="finding-group finding-warning"><h3>Review flags</h3><ul>{underwriting.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
            <div className="finding-group finding-explanation"><h3>Model explanation</h3><ul>{underwriting.explanations.map((explanation) => <li key={explanation}>{explanation}</li>)}</ul></div>
          </section>

          <section className="rail-panel drafts-panel" aria-labelledby="drafts-title">
            <div className="rail-panel-heading"><div><p className="eyebrow">07 / Preparation only</p><h2 id="drafts-title">Seller message drafts</h2></div><button type="button" className="button button-quiet" onClick={regenerateDrafts}>Regenerate</button></div>
            <div className="draft-boundary"><strong>Drafts never send.</strong> Approval records a local review only; it does not contact a seller or verify a fact.</div>
            <div className="draft-list">
              {state.drafts.map((draft, index) => {
                const editedOfferExceedsMax =
                  draft.key === 'evidence-offer' &&
                  hasDollarAmountAbove(draft.text, underwriting.maxBuy)
                const offerDraftIsCanonical =
                  draft.key !== 'evidence-offer' ||
                  isCanonicalOfferDraft(draft.text, canonicalOfferDraftText)
                const offerBlocked =
                  draft.key === 'evidence-offer' &&
                  (underwriting.decision !== 'go' || editedOfferExceedsMax || !offerDraftIsCanonical)
                return <article className="draft-card" key={draft.key}>
                  <div className="draft-card-top"><div><span className="row-number">STEP / {String(index + 1).padStart(2, '0')}</span><h3>{draft.label}</h3></div><span className={`approval-chip approval-${draft.approval.status}`}>{draft.approval.status}</span></div>
                  <p className="draft-objective">{draft.objective}</p>
                  <label className="field" htmlFor={`draft-${draft.key}`}><span className="field-label">Editable draft text</span><textarea id={`draft-${draft.key}`} rows={4} value={draft.text} onChange={(event) => updateDraftText(draft.key, event.target.value)} /></label>
                  <div className="draft-footer"><span className="draft-fields">Needs: {draft.requiredFields.join(' · ')}</span><div className="approval-actions"><button type="button" className="button button-small button-primary" disabled={offerBlocked} onClick={() => updateDraftApproval(draft.key, 'approved')}>Approve review</button><button type="button" className="button button-small button-secondary" onClick={() => updateDraftApproval(draft.key, 'rejected')}>Reject</button><button type="button" className="button button-small button-quiet" onClick={() => updateDraftApproval(draft.key, 'pending')}>Pending</button></div></div>
                  {offerBlocked ? <p className="blocked-note">{!offerDraftIsCanonical ? 'Offer approval is blocked because offer copy was edited; regenerate the canonical capped draft.' : editedOfferExceedsMax ? 'Offer approval is blocked because the edited draft contains an amount above max buy.' : `Offer approval is blocked while the gate is ${titleCase(underwriting.decision)}.`}</p> : null}
                </article>
              })}
            </div>
          </section>
        </aside>
      </main>

      <footer className="app-footer"><span>Carsplore / local underwriting cockpit</span><span>Fixture, manual evidence, and modeled output remain visibly distinct from live or verified facts.</span></footer>
    </div>
  )
}

export default App
