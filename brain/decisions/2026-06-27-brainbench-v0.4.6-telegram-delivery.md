---
type: decision-log
id: brainbench-v0.4.6-telegram-delivery
title: "Approve live local Telegram delivery for read-only BrainBench digests"
date: 2026-06-27
status: approved
owner: Shailesh Rawat
resolves: gap-2026-06-27-567683d-toolsmith-script-architecture
---

# Decision Record: Approve live local Telegram delivery for read-only BrainBench digests

## Context & Background
To transition to V0.4.6, we implemented a live local Telegram Bot integration daemon (`telegram-bot.ts`) under Toolsmith scripts. This integration executes getUpdates long polling to process operator queries and replies with text-based message payloads.

## Governance & Safety Boundaries
1. **Approved Live Polling**: V0.4.6 approves live local Telegram delivery for read-only BrainBench digests. It does not approve mutation commands, task transitions, PR creation, decision approval, merge actions, or hosted deployment.
2. **Whitelisting Enforcement**: Messages from unauthorized chat IDs are strictly rejected on the boundary without invoking `telegram-digest.ts`.
3. **Spawning Safety**: Spawns `telegram-digest.ts` safely using argument arrays to prevent untrusted input injection.
4. **Audit and Non-Mutation**: Every command, including rejected mutation requests, continues to emit audit evidence. No state files in the control plane are modified by any execution of this adapter.

## Gaps Resolved
- Resolves: `gap-2026-06-27-567683d-toolsmith-script-architecture`
