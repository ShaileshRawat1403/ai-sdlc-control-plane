---
type: decision-log
status: accepted
date: 2026-06-25
system: BrainBench
---

# Decision Log: BrainBench V0.4 State Semantics & Field Trial Refinement

## Context
Based on observations from the BrainBench V0.3 field trials (Tessera, Flowright, ToolSmith), the default behavior of treating the entire `state/` directory as restricted was operationally noisy. Routine sprint status updates, memory refreshes, and dashboard state updates constantly triggered `HIGH` risk classifications and unnecessary decision gaps requiring manual operator intervention.

This decision record formally approves and documents the V0.4 refinement changes designed to decrease alerts noise without weakening control plane governance.

## Decisions & Rules

1. **State File Risk Classifications**:
   - The `state/` directory is no longer restricted as a monolith. Instead, paths are classified under:
     - `restricted` (triggers `HIGH` risk review): `state/intelligence-rules.yml` and `state/intelligence-scan.yml`.
     - `review_required` (triggers `MEDIUM` risk review): `state/active-systems.yml`.
     - `operational_generated` (triggers `MEDIUM` risk review with descriptive handling and reason): `state/active-sprint.yml`, `state/dashboard-state.yml`, and `state/memory-index.yml`.
2. **Contextual Risk Assessment**:
   - Risk reports must provide detailed reasons and clear, operational handling suggestions for changed files rather than simply outputting level names (e.g. distinguishing mechanical state movement from manual rules edits).
3. **Mechanical Updates**:
   - Files classified as mechanical updates (including active sprint logs, generated dashboards, indices, and audit run logs) are excluded from triggering new decision gaps in `decision-gap.ts`. However, they must still be recorded in PR review and execution logs to preserve the audit trail.
4. **Dashboard Control Surface**:
   - A single-entry dashboard index file [index.md](file:///Users/ananyalayek/.gemini/antigravity/scratch/brainbench/dashboard/index.md) is introduced to present a unified view of active sprint progress, field trial progress, open risks, and gaps.
5. **Decoupled Configuration**:
   - Specific field trial issue registry IDs must be stored in state configurations (e.g., `state/active-sprint.yml`) rather than being hardcoded in automation scripts.
