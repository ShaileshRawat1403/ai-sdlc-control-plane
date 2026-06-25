import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { verifyWritePermission } from './shared/intelligence-rules';
import { updateGeneratedBlock } from './shared/generated-blocks';

// Paths
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WEEKLY_REPORT_PATH = path.join(REPO_ROOT, 'dashboard/weekly-report.md');
const ACTIVE_CONTEXT_PATH = path.join(REPO_ROOT, 'memory/active-context.md');
const STATE_DIR = path.join(REPO_ROOT, 'state');
const ECOSYSTEM_PATH = path.join(REPO_ROOT, 'ecosystem.yml');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const DECISION_GAPS_PATH = path.join(REPO_ROOT, 'dashboard/decision-gaps.md');
const EVIDENCE_GAPS_PATH = path.join(REPO_ROOT, 'dashboard/evidence-gaps.md');
const TRIAGE_GAPS_PATH = path.join(REPO_ROOT, 'dashboard/triage-suggestions.md');
const INTELLIGENCE_SUMMARY_PATH = path.join(REPO_ROOT, 'dashboard/intelligence-summary.md');

const dryRun = process.env.DRY_RUN === 'true';
const agentKey = 'weekly_operator_brief';
const briefMode = process.env.BRIEF_MODE || 'daily'; // daily | weekly | manual

console.log(`[Weekly Brief] Running brief generator (Mode: ${briefMode})...`);

// 1. Enforce path rules
verifyWritePermission(agentKey, WEEKLY_REPORT_PATH);
verifyWritePermission(agentKey, ACTIVE_CONTEXT_PATH);
verifyWritePermission(agentKey, INTELLIGENCE_SUMMARY_PATH);

// Helper to count lines/items in dashboard files
function countItemsInDashboard(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf-8');
  // Simple check for rows in generated markdown tables
  const lines = content.split('\n');
  let rowCount = 0;
  let inTable = false;
  for (const line of lines) {
    if (line.includes('|---|---|')) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('|') && !line.includes('| - |')) {
      rowCount++;
    }
    if (inTable && line.trim() === '') {
      inTable = false;
    }
  }
  return rowCount;
}

const decisionGapsCount = countItemsInDashboard(DECISION_GAPS_PATH);
const evidenceGapsCount = countItemsInDashboard(EVIDENCE_GAPS_PATH);
const triageGapsCount = countItemsInDashboard(TRIAGE_GAPS_PATH);

// Load sprint backlog info
let activeSprint: any = {};
const sprintPath = path.join(STATE_DIR, 'active-sprint.yml');
if (fs.existsSync(sprintPath)) {
  try {
    const spr = parse(fs.readFileSync(sprintPath, 'utf-8'));
    activeSprint = spr.sprint || {};
  } catch (e) {}
}

const backlog = activeSprint.sprint_backlog || [];
const completedTasks = backlog.filter((t: any) => t.status === 'done').length;
const totalTasks = backlog.length;
const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

// Load field trial metrics from active sprint registry
const fieldTrial = activeSprint.field_trial || {};
const fieldTrialTasks = backlog.filter((t: any) => (fieldTrial.work_items || []).includes(t.task));
const completedFieldTrialTasks = fieldTrialTasks.filter((t: any) => t.status === 'done').length;
const totalFieldTrialTasks = fieldTrialTasks.length;
const fieldTrialPercentage = totalFieldTrialTasks > 0 ? Math.round((completedFieldTrialTasks / totalFieldTrialTasks) * 100) : 0;

// Load active focus from ecosystem
let ecosystemSystems: any = {};
if (fs.existsSync(ECOSYSTEM_PATH)) {
  try {
    const eco = parse(fs.readFileSync(ECOSYSTEM_PATH, 'utf-8'));
    ecosystemSystems = eco.systems || {};
  } catch (e) {}
}

const activeSystems: string[] = [];
for (const sysId in ecosystemSystems) {
  if (ecosystemSystems[sysId].status === 'active') {
    activeSystems.push(ecosystemSystems[sysId].name);
  }
}

// 2. Generate Weekly Brief Report
const dateStr = new Date().toISOString().split('T')[0];
let reportContent = `## Operational Brief Summary (${dateStr})
- **Report Mode**: \`${briefMode}\`
- **Active Sprint Progress**: ${completedTasks} / ${totalTasks} tasks (${completionPercentage}%)
- **Field Trial Progress**: ${completedFieldTrialTasks} / ${totalFieldTrialTasks} tasks (${fieldTrialPercentage}%)
- **Active Systems**: ${activeSystems.join(', ') || 'none'}

### Alerts & Gaps
- **Decision Gaps**: ${decisionGapsCount} items flagged
- **Evidence Gaps**: ${evidenceGapsCount} items flagged

### Recommended Actions
`;

if (decisionGapsCount > 0) {
  reportContent += `- **Remediate Decisions**: Human operator should check \`dashboard/decision-gaps.md\` and review generated decision drafts.\n`;
}
if (evidenceGapsCount > 0) {
  reportContent += `- **Remediate Evidence**: Verify linked validation logs for ready/done items in \`dashboard/evidence-gaps.md\`.\n`;
}
if (decisionGapsCount === 0 && evidenceGapsCount === 0) {
  reportContent += `- **Ecosystem Stable**: No outstanding gaps detected. Focus on implementing sprint backlog tasks.\n`;
}

// Generate Intelligence Summary
let summaryContent = `## Active Quality & Operations Findings

- **Detected Evidence Gaps**: ${evidenceGapsCount}
- **Detected Decision Gaps**: ${decisionGapsCount}
- **Detected Triage Warnings**: ${triageGapsCount}

### Detail Dashboards
- [Evidence Gaps Dashboard](file://${EVIDENCE_GAPS_PATH})
- [Decision Gaps Dashboard](file://${DECISION_GAPS_PATH})
- [Triage Suggestions Dashboard](file://${TRIAGE_GAPS_PATH})
`;

// Update dashboards
updateGeneratedBlock(WEEKLY_REPORT_PATH, reportContent, '');
updateGeneratedBlock(INTELLIGENCE_SUMMARY_PATH, summaryContent, '');

// 3. Update active-context.md in the weekly-focus section
const activeContextWeeklyFocus = `- **Active Sprint Progress**: ${completedTasks}/${totalTasks} completed (${completionPercentage}%).
- **Field Trial Progress**: ${completedFieldTrialTasks}/${totalFieldTrialTasks} completed (${fieldTrialPercentage}%).
- **Quality Gates Check**: ${decisionGapsCount} decision gaps, ${evidenceGapsCount} evidence gaps detected.
- **Recommended Action**: ${decisionGapsCount > 0 || evidenceGapsCount > 0 ? 'Remediate state mismatch alerts.' : 'Proceed with backlog execution.'}`;

if (!dryRun) {
  updateGeneratedBlock(ACTIVE_CONTEXT_PATH, activeContextWeeklyFocus, 'weekly-focus');
  console.log(`[Weekly Brief] Updated weekly-focus section in ${ACTIVE_CONTEXT_PATH}`);
} else {
  console.log(`[DRY RUN] Would update weekly-focus block in ${ACTIVE_CONTEXT_PATH}:\n${activeContextWeeklyFocus}`);
}

// 4. Save Execution Run Log
const agentRunFileName = `${dateStr}-weekly-operator-brief.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: weekly-operator-brief
date: ${dateStr}
status: success
---

# Agent Run: Weekly Operator Brief

## Execution Summary
- **Decision Gaps Counted**: ${decisionGapsCount}
- **Evidence Gaps Counted**: ${evidenceGapsCount}
- **Mode**: ${briefMode}
- **Dry Run**: ${dryRun}

## Actions Taken
- Aggregated audit metrics and status metrics.
- Refreshed generated block in \`dashboard/weekly-report.md\`.
- Refreshed \`weekly-focus\` generated block in \`memory/active-context.md\`.
`;

verifyWritePermission(agentKey, agentRunFilePath);
if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Weekly Brief] Logged run success to ${agentRunFilePath}`);
}

console.log('[Weekly Brief] Completed successfully.');
