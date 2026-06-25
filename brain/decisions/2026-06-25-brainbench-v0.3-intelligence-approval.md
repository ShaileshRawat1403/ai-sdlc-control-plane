---
type: decision-log
status: accepted
gap_id: gap-2026-06-25-c57f749-state-memory-model
resolves: gap-2026-06-25-2f4d757-toolsmith-script-architecture
date: 2026-06-25
system: BrainBench
---

# Decision Log: BrainBench V0.3 Advisory Intelligence Approval

## Context
BrainBench is evolving from deterministic automation (V0.2) to advisory agent intelligence (V0.3). We have introduced advisory scripts to surface quality findings, decision gaps, work item triage warnings, and operator status briefs. 

This decision record serves as the formal governance approval for the V0.3 changes.

## Decisions & Rules
1. **Advisory Scope**: Intelligence agents remain strictly advisory. They are prohibited from:
   - Performing auto-merges or auto-approvals of Pull Requests.
   - Performing auto-closures of work items.
   - Mutating human-managed metadata fields (like owner, priority, and human notes).
2. **Authorized Paths**: Agents can only write to paths whitelisted in `state/intelligence-rules.yml` (e.g. `dashboard/`, `bench/agent-runs/`, `bench/validation/evidence-index.md`, and specific generated blocks in `memory/active-context.md` or `bench/work-items/*.md`).
3. **Gap Persistence & Resolution**: 
   - Decision gaps are grouped by governance theme and tracked under `open_gaps` in `state/intelligence-scan.yml` to prevent gaps from disappearing after scans.
   - A gap is resolved automatically when an accepted or approved decision log (`status: accepted` or `status: approved`) references the corresponding `gap_id`.
   - A gap can be manually dismissed by a human operator by moving it to `dismissed_gaps` with a valid reason.
4. **Allowed Future Phases**: Future phases (such as Phase 4 regression memory and eval suggestions) are permitted only after V0.3 loop validation has proven stable under real work cycles. No external integrations (e.g. RAG, external metrics, auto-fixers) may be added until the internal loop is validated.
