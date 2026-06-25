---
type: decision-log
id: brainbench-v0.4.1-cockpit-approval
title: "Approve BrainBench V0.4.1 Visual Markdown Cockpit Refinements"
date: 2026-06-25
status: approved
owner: Shailesh Rawat
---

# Decision Record: BrainBench V0.4.1 Visual Markdown Cockpit

## Context & Background
To improve the usability of BrainBench as a primary control surface for the operator, we are replacing the simple text-based summary in `dashboard/index.md` with a repo-native visual cockpit.

## Approved Changes
1. **Operating Snapshot**: High-level status cards showing active sprint progress, trial status, and open gate metrics.
2. **SDLC Pipeline Diagram**: Dynamic Mermaid LR flowchart showing counts at each pipeline step (Intake, Triage, In Progress, PR Review, Evidence, Decision, Done).
3. **Quality Gates Panel**: Gate status table mapping PR reviews, evidence/decision gaps, and human review lanes.
4. **System Health Grid**: Health table summarizing status, branch focus, risk level, and evidence status for all systems in the registry.
5. **Needs Human Review Lane**: Specific lane mapping task reviews with explicit actions.
6. **Agent Advisory Lane**: Advisory lane mapping signals from scanning agents.

## Implementation Verification
- Ran `bun run systems/toolsmith/scripts/dashboard-refresh.ts`.
- Verified that all block markers (e.g. `<!-- brainbench:generated:visual-snapshot:start -->`) are correctly identified, populated, and preserve manual notes.
- Verified Mermaid flowchart structure renders correctly.
- Confirmed that only active PRs are counted as open PR reviews.
