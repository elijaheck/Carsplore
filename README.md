# Carsplore

Carsplore is a **single-user, local-first vehicle-flip underwriting cockpit**.
The canonical repository is `/Users/elijaheck/Projects/Carsplore`. The first
MVP proves the operator loop with manual entries, deterministic math, and
fictional fixture data; it is not a hosted service or a production data
collector.

## What this MVP does

1. The operator manually enters or pastes a listing.
2. The operator manually enters active and sold comparable listings, including
   source and retrieval timestamp.
3. The operator records title, accident, condition, and KBB/MMR/CARFAX-like
   evidence. Those facts are operator-supplied evidence with timestamps only;
   this app does not fetch or verify them.
4. Carsplore presents a conservative resale/quick-sale view, a deterministic
   maximum-buy number, reasons for reject or manual review, and seller-question
   or offer drafts.

Sold comps carry full weight. Active asks carry half weight, and stale/expired
listings carry less. A listing that has sat longer than the target days-on-market
is adjusted downward rather than treated as proof of value.

The built-in **2007 Mazda 6 example is fictional fixture data**. It is not a
real listing, VIN, title record, history report, provider valuation, or promise
about a real car. Any other sample records must be labeled as fixture data too.

## Product boundary

This local MVP has no Facebook authentication or scraping, no messaging send,
no real VIN/title/CARFAX/KBB/MMR lookup, no copied sessions, no CAPTCHA bypass,
and no mass messaging. It makes no plate-to-owner, plate-to-address,
plate-to-lender, or plate-to-balance claim. It does not perform unauthorized
redistribution, provide a hosted service, or use an LLM for valuation. There are
no provider or marketplace integrations implied by a manually entered field.

KBB/MMR/CARFAX-like values are evidence supplied by the operator, retained with
their source and timestamp. They must not be described as fetched, current,
verified, or authorized provider output.

Messaging is preparation only: every draft requires explicit human approval and
the app never sends it. Human approval does not turn a fixture or an unverified
fact into verified evidence.

## Accident and buy policy

A minor repaired accident on an otherwise clean-title vehicle is a bounded
valuation adjustment and inspection flag, not an automatic rejection. The MVP
uses 8% of modeled retail, bounded to a $150 minimum and $5,000 maximum. Branded
title, structural damage, flood/fire damage, unresolved airbag issues, title
not in the seller's name, or material drivability faults are hard-stop or
manual-review conditions. Unknown history remains unknown and requires human
review; it is never silently treated as clean.

For an eligible vehicle, the deterministic maximum-buy formula is:

```text
maximum buy = conservative quick-sale value
             - recon
             - transport
             - title/tax/transaction costs
             - risk reserve
             - target profit
```

Every term is an editable operator input. The fixture calibration is a
conservative quick-sale value of `$2,350`, total non-acquisition costs of
`$350`, and target profit of `$500`, yielding a `$1,500` maximum buy. These are
fixture defaults, not a market quote. A hard-stop/manual-review condition has
no approved maximum buy until a human resolves it. The formula is not an LLM
opinion and must not silently include an unrecorded cost.

## Local data and reset controls

Persistence is browser `localStorage` only. There is no server database, account,
cloud sync, or external writeback.

- **Reset fixture** restores the built-in fictional fixture state and replaces
  the current local draft.
- **Clear local data** removes Carsplore's saved deal and records a small local
  cleared sentinel, so reloads remain a clean first-run state. **Reset fixture**
  intentionally replaces that sentinel with the fictional fixture draft.

These controls do not delete repository files, erase browser history, alter a
provider or marketplace, or send a message.

## Local setup and verification

From `/Users/elijaheck/Projects/Carsplore`:

```bash
npm install
npm run dev
npm test
npm run typecheck
npm run build
```

`npm run dev` starts the local development server. The other commands are local
checks; they do not authenticate, scrape, query a real vehicle, send a message,
deploy, or publish anything.

## Explicit approval gates

Do not change public GitHub metadata or visibility, commit or push, deploy,
purchase data/API access, create paid accounts, authenticate to or collect from
Facebook, query a real vehicle, collect personal data, redistribute source
data, or conduct outbound prospecting without explicit owner approval. Preserve
the local, single-user, fixture-backed boundary while this MVP is being
validated.
