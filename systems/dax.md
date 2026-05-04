# DAX

## Role

Governed execution workstation for AI-assisted SDLC.

## Current status

Active.

## Current branch

`feat/sdlc-verification-harness`

## Current objective

Add the first SDLC verification harness that treats tests, CI checks, and command outputs as structured evidence.

## Next action

Run local validation:

```bash
bun run typecheck:dax
bun run test
dax sdlc verify --format json
dax sdlc verify --native --format json --receipts
```

## Current boundary

Do not rewrite the existing `dax verify <session-id>` command.

The SDLC harness lives under `dax sdlc verify` until it is validated.

## Do not expand into

- Dagger integration
- OPA policy rewrite
- PR automation
- deployment automation
- dashboard work
