---
type: decision-log
id: brainbench-v0.4.5-adapter-registration
title: "Approve adapter-hermes Registration in BrainBench"
date: 2026-06-27
status: approved
owner: Shailesh Rawat
resolves: gap-2026-06-27-11002a6-state-memory-model, gap-2026-06-27-a3e094b-state-memory-model
---

# Decision Record: Approve adapter-hermes Registration

## Context & Background
To transition to V0.4.5, we registered the newly developed `adapter-hermes` V0.1 intent adapter inside the BrainBench control plane. This ensures that the control plane is fully aware of the Hermes adapter capabilities, runtime constraints, and safety boundaries.

## Approved Changes
1. **Registry Enforcements (`state/repo-agent-registry.yml`)**:
   - Added the `handoff_scope: observation_only` parameter across repo agent observers to define explicit operational boundaries.
2. **Adapter Registry (`state/adapter-registry.yml`)**:
   - Created the adapter capability register, mapping `adapter-hermes` version 0.1, its runtime `Hermes`, its kernel `Flowright`, allowed read-only actions (`observe`, `summarize`, `recommend`, `prepare`), and forbidden mutation/approval actions.

## Gaps Resolved
- Resolves: `gap-2026-06-27-11002a6-state-memory-model`
- Resolves: `gap-2026-06-27-a3e094b-state-memory-model`

## Implementation Verification
- Verified that `state/adapter-registry.yml` exists and conforms to the registry model.
- Ran the decision-gap scanner to verify full compliance.
