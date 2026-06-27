---
type: decision-log
id: brainbench-v0.4.8-railway-deployment
title: "Approve container packaging, Railway deployment config, and daemon-level scheduled delivery of read-only Telegram digests"
date: 2026-06-27
status: approved
owner: Shailesh Rawat
resolves: gap-2026-06-27-railway-deployment-gap
---

# Decision Record: Approve container packaging, Railway deployment config, and daemon-level scheduled delivery of read-only Telegram digests

## Context & Background
To transition to V0.4.8, we packaged the Telegram bot daemon for production hosting and added timezone-aware local scheduling to deliver digests to the whitelisted operator chat.

## Governance & Safety Boundaries
1. **Approved Scope**: V0.4.8 approves container packaging, Railway deployment configuration, and daemon-level scheduled delivery of read-only Telegram digests. It does not approve mutation commands, hosted state mutations, PR actions, merge actions, decision approvals, webhook mode, or multi-user Telegram access.
2. **Timezone Awareness**: The scheduler calculates and targets the `Asia/Kolkata` (IST) timezone (18:00 IST daily / Sunday 18:00 IST weekly) for digest broadcasts.
3. **Deduplication Caveat**: Delivery deduplication is process-local and kept in memory. A service restart around 18:00 IST may reset scheduler memory, meaning V0.4.8 does not guarantee durable exactly-once delivery.
4. **Environment Security**: Sensitive keys (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID`) are configured exclusively via the hosting dashboard. The local `.env` is ignored by Git, and `.dockerignore` prevents it from being baked into the build image.

## Gaps Resolved
- Resolves: `gap-2026-06-27-railway-deployment-gap`
