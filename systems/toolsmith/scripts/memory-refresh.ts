import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

// Configuration
const REPO_ROOT = path.resolve(__dirname, '../../../');
const ECOSYSTEM_PATH = path.join(REPO_ROOT, 'ecosystem.yml');
const MEMORY_DIR = path.join(REPO_ROOT, 'memory');
const ACTIVE_CONTEXT_PATH = path.join(MEMORY_DIR, 'active-context.md');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const dryRun = process.env.DRY_RUN === 'true';

console.log('[Memory Refresh] Refreshing active context...');
if (dryRun) console.log('[DRY RUN] Enabled - no files will be written.');

// 1. Ingest configurations
let ecosystemSystems: any = {};
if (fs.existsSync(ECOSYSTEM_PATH)) {
  try {
    const eco = parse(fs.readFileSync(ECOSYSTEM_PATH, 'utf-8'));
    ecosystemSystems = eco.systems || {};
  } catch (e) {
    console.error('Failed to parse ecosystem.yml:', e);
  }
}

// Extract active systems and branches
const activeSysList: string[] = [];
const activeBranchList: string[] = [];

for (const sysId in ecosystemSystems) {
  const sys = ecosystemSystems[sysId];
  if (sys.status === 'active') {
    activeSysList.push(sys.name);
    if (sys.current_branch) {
      activeBranchList.push(`- \`systems/${sysId}\`: \`${sys.current_branch}\` (active)`);
    }
  }
}

// 2. Generate active context content
const timestamp = new Date().toISOString();
const activeContextMarkdown = `# Active Context

## Last Updated
${timestamp}

## Current Focus
We are running in the **Brain + Bench V2** control plane environment. The active system workflows are governed by automated triggers.

## Active Focus Systems
${activeSysList.map(s => `- ${s}`).join('\n') || '- None'}

## Active Branches
${activeBranchList.join('\n') || '- None'}

## Active Decisions
- Pointer stubs left in place to redirect legacy paths.
- Active refactor log recorded in \`brain/decisions/2026-06-25-brainbench-v2-identity.md\`.
`;

// Update memory/active-context.md
if (!dryRun) {
  fs.writeFileSync(ACTIVE_CONTEXT_PATH, activeContextMarkdown, 'utf-8');
  console.log(`[Memory Refresh] Saved updated context to ${ACTIVE_CONTEXT_PATH}`);
} else {
  console.log(`[DRY RUN] Would write to ${ACTIVE_CONTEXT_PATH}:\n${activeContextMarkdown}`);
}

// 3. Write execution log
const dateStr = new Date().toISOString().split('T')[0];
const agentRunFileName = `${dateStr}-memory-refresh.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: memory-refresh
date: ${dateStr}
status: success
---

# Agent Run: Memory Refresh

## Execution Summary
- **Date**: ${dateStr}
- **Dry Run**: ${dryRun}

## Actions Taken
- Refreshed \`memory/active-context.md\` by mapping active focus systems and branches.
`;

if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Memory Refresh] Logged execution run to ${agentRunFilePath}`);
}

console.log('[Memory Refresh] Completed successfully.');
