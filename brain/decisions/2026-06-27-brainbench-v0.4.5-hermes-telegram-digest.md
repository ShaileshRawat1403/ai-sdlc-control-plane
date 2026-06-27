---
type: decision-log
id: brainbench-v0.4.5-hermes-telegram-digest
title: "Approve read-only simulated Telegram digest integration"
date: 2026-06-27
status: approved
owner: Shailesh Rawat
resolves: gap-2026-06-27-9c31c46-toolsmith-script-architecture
---

# Decision Record: Approve read-only simulated Telegram digest integration

## Context & Background
To transition to V0.4.5, we implemented a simulated Telegram command adapter (`telegram-digest.ts`) under Toolsmith scripts. This integration enables operators to query BrainBench cockpit status, weekly metrics, repo agent handoffs, blockers, evidence logs, and decision logs from a unified interface.

## Governance & Safety Boundaries
1. **Governance Gate**: All commands are routed through `adapter-hermes` V0.1 intent adapter to enforce safety rules prior to any execution.
2. **Read-only Enforcement**: Only read-only commands (`/status`, `/weekly`, `/handoffs`, `/blockers`, `/evidence`, `/decisions`) are allowed and executed.
3. **Mutation Blocking**: State-changing commands (`/mark_done`, `/approve`, `/open_pr`, `/merge`, `/edit_state`) are strictly blocked and rejected with high risk flags and fallbacks.
4. **Audit Trace**: Every transaction, including allowed queries and blocked mutations, generates audit evidence logs saved under `bench/agent-runs/hermes/`.
5. **No Mutation**: No state files in the control plane are modified by any execution of this adapter.

## Gaps Resolved
- Resolves: `gap-2026-06-27-9c31c46-toolsmith-script-architecture`
