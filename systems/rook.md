# Rook

## Role

Repo/operator workbench for visible, governable AI-assisted work.

## Current status

Active.

## Current branch

`feat/sdlc-verification-harness`

## Current objective

Add internal SDLC verification core before wiring CLI commands.

## Next action

Run local validation:

```bash
source bin/activate-hermit
cargo fmt --check
cargo clippy --workspace --all-targets --exclude v8 -- -D warnings
cargo test --workspace
```

## Current boundary

Do not patch the large CLI parser blindly.

Wire `rook verify` only after the SDLC core compiles cleanly.

## Do not expand into

- DAX Sentinel implementation
- UI panel work
- Dagger integration
- workflow dashboard
