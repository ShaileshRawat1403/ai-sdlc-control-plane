# Decision Record: AI SDLC Control Plane Scope

## Date

2026-05-04

## Status

accepted

## Context

The ecosystem contains several related systems and too many active ideas can create branch sprawl and mental debt.

## Decision

Create a dedicated control-plane repo for tracking only five systems:

- DAX
- Rook
- Soothsayer
- Picobot
- PruningMyPothos

The repo will track status, daily reports, handoffs, decisions, and scope boundaries.

## Rationale

A narrow SDLC control plane keeps the work reviewable and prevents the control repo from becoming another product.

## Implications

- Only DAX and Rook are active right now.
- Soothsayer remains paused.
- Picobot and PruningMyPothos remain unmapped until exact repositories are confirmed.
- Daily reports are scaffolded through GitHub Actions.

## Follow-up

Validate DAX and Rook SDLC verification branches before promoting any other system to active.
