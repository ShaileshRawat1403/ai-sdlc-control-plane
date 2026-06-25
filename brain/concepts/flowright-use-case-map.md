# Flowright Concept: Use-Case & Product-Fit Map

This concept note outlines the use-case mapping and product-fit strategy for Flowright.

## Problem Statement
Standard workflow engines (like Temporal, Airflow) are heavy, require complex infrastructure, and are not designed for LLM-native state transitions, multi-agent pipelines, or context-aware branching. There is a need for a lightweight, file-backed, or Git-native state transition manager that enforces execution rules without massive runtime dependency.

## Target Users
- **Multi-Agent Systems**: Agents that need to execute complex sequences of actions with deterministic checkpoints.
- **Micro-App Developers**: Developers building lightweight background pipelines that require state tracking but not full enterprise queueing systems.

## Use-Case Categories
1. **Multi-Agent Chain of Custody**: Passing handoffs and logs between agents securely (e.g. BrainBench's handshake loop).
2. **Git-Backed Linear Sprints**: Running code updates, running validations, staging releases, and logging evidence.
3. **Guardrail Pipelines**: Intercepting process outputs, evaluating quality/risk metrics, and executing fallback steps.

## Product-Fit Map
- **Core Fit**: Clean representation of process states and transitions in human-readable files (YAML/Markdown).
- **Secondary Fit**: Advisory agent actions that check preconditions and transition rules.
- **Non-Fit**: High-frequency transactional data or real-time event brokers (e.g. Kafka, Redis).

## Kernel-Governance Positioning
Flowright sits as a core workflow coordinator inside the control plane. It coordinates execution tasks but delegates actual verification (like `dax verify` or `pr-review`) to separate, specialized systems. It acts as the "connective tissue" of the SDLC workspace.

## Evidence Needed for Validation
- A transition schema tracking a mock issue through intake → review → done.
- Validation checks confirming transition rules are enforced (e.g. cannot transition to `done` without `pr-review`).

## Open Questions
- Should Flowright be compiled as a TypeScript SDK, or distributed as a Python package?
- How do we handle concurrent execution transitions securely without a centralized SQL database?
