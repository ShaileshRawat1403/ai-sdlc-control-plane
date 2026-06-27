---
type: decision-log
id: brainbench-v0.4.7-digest-quality
title: "Approve formatting, prioritization, readability, and source-reference improvements for Telegram digest outputs"
date: 2026-06-27
status: approved
owner: Shailesh Rawat
resolves: gap-2026-06-27-digest-quality-gap
---

# Decision Record: Approve formatting, prioritization, readability, and source-reference improvements for Telegram digest outputs

## Context & Background
To transition to V0.4.7, we refined the simulated Telegram digest output formatting in `telegram-digest.ts`. This ensures that messages are clean, compact, and optimized for display on mobile devices, while prioritizing actionable information.

## Governance & Safety Boundaries
1. **Approved Scope**: V0.4.7 approves formatting, prioritization, readability, and source-reference improvements for Telegram digest outputs. It does not introduce new commands, mutation rights, webhook behavior, deployment changes, state transitions, PR actions, merge actions, or decision approval.
2. **Prioritization Layer**: Configured the `/status` command to dynamically derive and display a Top 3 Priorities Needing Attention section based on:
   - Human review required
   - Active blockers
   - Open evidence gaps
   - Open decision gaps
   - Stale repo handoffs
   - Sprint items not done
3. **Repository Groupings**: Grouped repository agent handoffs under `Daily Active`, `Weekly Summary`, and `Paused / Dormant` cadences with freshness checks.
4. **Action-Oriented Details**: Updated `/blockers` to highlight specific required actions.
5. **Source References**: Added explicit `Source:` file mapping references to all read-only query responses.

## Gaps Resolved
- Resolves: `gap-2026-06-27-digest-quality-gap`
