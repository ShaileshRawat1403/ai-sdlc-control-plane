# Agent Instructions

This repository is the control plane for the AI SDLC ecosystem.

## Prime directive

Do not turn this repository into a product.

It is an execution ledger, not a dashboard, application, or automation platform.

## Before doing work

Read:

1. `CONTROL.md`
2. `ecosystem.yml`
3. `daily/latest.md`
4. relevant file under `systems/`
5. relevant handoff under `handoffs/`

## Allowed work

Agents may:

- add daily reports
- update system status
- create handoff documents
- record decisions
- add parking lot items
- prepare scoped branch plans
- update `ecosystem.yml` when status changes

## Restricted work

Agents must not:

- add dashboards
- add app code
- introduce broad automation
- modify tracked product repos from this repo
- expand beyond the five tracked systems
- move a paused system to active without updating `CONTROL.md` and `ecosystem.yml`

## Required handoff structure

Every implementation handoff must include:

- objective
- repo
- branch
- status
- exact files changed or expected
- validation commands
- non-goals
- stop conditions
- next agent instructions

## Validation discipline

If validation cannot be run, say so clearly and mark the relevant item as `needs_local_validation`.

Do not claim a branch is ready unless validation evidence exists.
