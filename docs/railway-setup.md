# Railway Scheduled Delivery Configuration Guide

This guide documents how to package, deploy, and configure **BrainBench V0.4.8: Railway / Scheduled Delivery** on the Railway platform.

---

## 1. Environment & Variables

Before deploying, configure the following variables in the Railway dashboard:

- **`TELEGRAM_BOT_TOKEN`**: The authentication token for the operator bot.
- **`TELEGRAM_ALLOWED_CHAT_ID`**: Whitelisted Telegram chat ID. Messages from any other source are rejected.
- **`ADAPTER_HERMES_PATH`**: The absolute path to the entrypoint of the `adapter-hermes` repository. Since the container must have access to both repositories, you can clone `adapter-hermes` into the container image or mount it, then set this variable to point to its `/path/to/adapter-hermes/src/index.ts`.

---

## 2. Timezone and Scheduler Behavior

- **Timezone**: The scheduler explicitly targets the **`Asia/Kolkata` (IST)** timezone (6:00 PM IST daily push, Sunday 6:00 PM IST weekly push) natively in JavaScript, independent of the container's system clock timezone.
- **Process-Local Deduplication**: Scheduled message deduplication is process-local and kept in memory. 
  - *Caveat*: If the container service restarts or redeploys around 18:00 IST, it may fire the digest again upon boot if the hour/minute check is still true. It does not guarantee durable exactly-once delivery.

---

## 3. Deployment Configuration

- **`Dockerfile`**: Builds using `oven/bun:1.0-alpine` base image, copying all repository files, installing production dependencies, and running the `telegram-bot.ts` daemon.
- **`railway.json`**: Sets build/deploy parameters, restarts policies to `ALWAYS`, and maps build triggers.
- **`.dockerignore`**: Excludes node_modules, tmp files, git history, and local `.env` files from being copied.
