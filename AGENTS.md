# Carsplore agent guide

This file is the repository contract for future agents. The canonical checkout is
`/Users/elijaheck/Projects/Carsplore`; do not use an archived copy or a
compatibility path. Carsplore is a single-user, local-first prototype for a
vehicle-flip underwriting cockpit. It is not a hosted service.

## First-MVP boundary

The first loop is deliberately manual and fixture-backed:

- The operator enters or pastes a listing and enters comparable listings by hand
  (active or sold), with the source and retrieval timestamp recorded.
- The app normalizes the operator's fields, shows deterministic deal economics,
  and prepares questions or an offer draft for review.
- Built-in examples are fixtures only. The **2007 Mazda 6 example is fictional
  fixture data**, not a live listing, VIN, history report, valuation, or claim
  about a real vehicle.
- KBB/MMR/CARFAX-like facts are operator-supplied evidence with a source and
  timestamp. They are not fetched, verified, or redistributed by this MVP.

There are no integrations hidden behind this boundary. In particular, do not
add or imply Facebook authentication or scraping, a messaging send, real
VIN/title/CARFAX/KBB/MMR lookup, copied sessions, CAPTCHA bypass, mass
messaging, plate-to-owner/address/lender/balance claims, unauthorized
redistribution, a hosted service, or LLM valuation. A fixture or a manually
entered value must never be presented as live or provider-verified data.

## Underwriting rules

- A minor repaired accident on an otherwise clean-title vehicle is a bounded
  valuation adjustment and a reason to inspect; it is not an automatic reject.
- Branded title, structural damage, flood or fire damage, unresolved airbag
  issues, title not in the seller's name, or material drivability faults are a
  hard stop or manual-review condition. Unknown evidence must stay unknown;
  never infer a clean history.
- The deterministic maximum-buy calculation is:

  `maximum buy = conservative quick-sale value - recon - transport - title/tax/transaction costs - risk reserve - target profit`

  All terms are editable operator inputs. The fixture calibration is a
  conservative quick-sale value of `$2,350`, total non-acquisition costs of
  `$350`, and target profit of `$500`, yielding a `$1,500` maximum buy. These
  are fixture defaults, not a market quote. Do not replace the expression with
  an LLM estimate or silently add a cost. A hard-stop/manual-review vehicle has
  no approved maximum buy until a human resolves the condition.

Seller messages are drafts only. Every draft requires human approval, and the
app never sends it; agents must not contact sellers or mass-message anyone.

## Persistence and reset semantics

The MVP persists only in browser `localStorage`; there is no server database or
cloud sync. `Reset fixture` restores the built-in fictional fixture state and
replaces the current local draft. `Clear local data` removes Carsplore's local
browser data so the next load is a clean first-run state. Neither action deletes
repository files, changes external services, or sends a message.

## Agent operating rules

- Read the repository instructions and inspect `git status --short` before
  editing. Preserve existing dirty work and make the smallest scoped patch.
- Keep source, tests, and docs aligned with the local fixture-only boundary.
- Verify locally with `npm install`, `npm run dev`, `npm test`,
  `npm run typecheck`, and `npm run build` as applicable. Do not claim a live
  provider or external integration based on a fixture.
- Explicit owner approval is required before changing public GitHub metadata or
  visibility, committing or pushing, deploying, purchasing data/API access,
  creating paid accounts, authenticating to or collecting from Facebook,
  querying a real vehicle, collecting personal data, redistributing source
  data, or conducting outbound prospecting.
- Never request or handle copied sessions, credentials, CAPTCHA solutions, or
  other secrets. Do not broaden this prototype into owner/address discovery,
  lender or balance lookup, mass messaging, or a multi-user hosted product.

The complete product boundary and operator walkthrough are in `README.md`.
