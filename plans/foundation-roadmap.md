# Foundation Roadmap

This roadmap keeps the control plane useful without turning it into a product.

## Phase 0: Scaffold

Status: in progress.

Goal: establish the repository structure, control rules, system pages, handoffs, and daily report automation.

Done when:

- `CONTROL.md` exists
- `ecosystem.yml` exists
- five system pages exist
- DAX and Rook handoffs exist
- daily report template exists
- initial daily report exists
- scheduled daily report workflow exists

## Phase 1: Validate active branches

Goal: validate current DAX and Rook SDLC verification branches.

DAX validation:

```bash
bun install
bun run typecheck:dax
bun run test
dax sdlc verify --format json
dax sdlc verify --native --format json --receipts
```

Rook validation:

```bash
source bin/activate-hermit
cargo fmt --check
cargo clippy --workspace --all-targets --exclude v8 -- -D warnings
cargo test --workspace
```

Do not move to Phase 2 until both active branches have validation notes.

## Phase 2: Wire Rook CLI

Goal: create a scoped handoff for `rook verify --json` after the SDLC core compiles.

Non-goals:

- no DAX Sentinel
- no UI panel
- no swarm expansion

## Phase 3: Add PR readiness planning

Goal: define handoffs for:

- `rook ci inspect --json`
- `rook pr-ready --json`
- `dax audit --from verification-report.json`

No implementation until Phase 1 is complete.

## Phase 4: Map unresolved systems

Goal: confirm exact repositories for:

- Picobot
- PruningMyPothos

Do not start implementation work on either system until repository mapping is complete.

## Phase 5: Automation review

Goal: decide whether the daily report workflow is enough.

Allowed additions:

- update `daily/latest.md`
- inject static status from `ecosystem.yml`

Not allowed yet:

- AI summaries
- dashboard UI
- automatic cross-repo write actions
- notification bots
