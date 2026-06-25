import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';

// Configuration
const REPO_ROOT = path.resolve(__dirname, '../../../');
const STATE_DIR = path.join(REPO_ROOT, 'state');
const DASHBOARD_DIR = path.join(REPO_ROOT, 'dashboard');
const SYSTEMS_DIR = path.join(REPO_ROOT, 'systems');
const PR_REVIEWS_DIR = path.join(REPO_ROOT, 'bench/pr-reviews');
const ECOSYSTEM_PATH = path.join(REPO_ROOT, 'ecosystem.yml');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const dryRun = process.env.DRY_RUN === 'true';

console.log('[Dashboard Refresh] Regenerating markdown views...');
if (dryRun) console.log('[DRY RUN] Enabled - no files will be written.');

// Helper to write to files respecting generated boundaries
function updateGeneratedSection(filePath: string, generatedContent: string, fallbackTitle: string) {
  const startMarker = '<!-- brainbench:generated:start -->';
  const endMarker = '<!-- brainbench:generated:end -->';
  
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    content = `# ${fallbackTitle}\n\n${startMarker}\n${endMarker}\n\n## Human Notes\n[Add manual notes here. These will be preserved by refresh script.]\n`;
  }

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    console.warn(`Markers missing or malformed in ${path.basename(filePath)}. Rewriting file with markers.`);
    content = `# ${fallbackTitle}\n\n${startMarker}\n\n${generatedContent.trim()}\n\n${endMarker}\n\n## Human Notes\n[Add manual notes here. These will be preserved by refresh script.]\n`;
  } else {
    content = content.slice(0, startIndex + startMarker.length) +
              '\n\n' + generatedContent.trim() + '\n\n' +
              content.slice(endIndex);
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[Dashboard Refresh] Updated ${filePath}`);
  } else {
    console.log(`[DRY RUN] Would write to ${filePath}:\n${content}`);
  }
}

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

let activeSprint: any = {};
const sprintPath = path.join(STATE_DIR, 'active-sprint.yml');
if (fs.existsSync(sprintPath)) {
  try {
    const spr = parse(fs.readFileSync(sprintPath, 'utf-8'));
    activeSprint = spr.sprint || {};
  } catch (e) {}
}

let activeSystems: any = {};
const activeSystemsPath = path.join(STATE_DIR, 'active-systems.yml');
if (fs.existsSync(activeSystemsPath)) {
  try {
    activeSystems = parse(fs.readFileSync(activeSystemsPath, 'utf-8')) || {};
  } catch (e) {}
}

let dashState: any = {};
const dashStatePath = path.join(STATE_DIR, 'dashboard-state.yml');
if (fs.existsSync(dashStatePath)) {
  try {
    const ds = parse(fs.readFileSync(dashStatePath, 'utf-8'));
    dashState = ds.dashboard_state || {};
  } catch (e) {}
}

// 2. Generate Project Views Dashboard
let projectViewsContent = `## Systems Registry Overview

| System | Role | Repository | Status | Priority |
|---|---|---|---|---|
`;
for (const sysId in ecosystemSystems) {
  const sys = ecosystemSystems[sysId];
  projectViewsContent += `| **${sys.name}** | ${sys.role} | \`${sys.repo || 'none'}\` | \`${sys.status}\` | \`${sys.priority || 'medium'}\` |\n`;
}
updateGeneratedSection(path.join(DASHBOARD_DIR, 'project-views.md'), projectViewsContent, 'Project Views');

// 3. Generate Sprint Status Dashboard
let sprintStatusContent = `## Active Sprint: ${activeSprint.name || 'none'}
- **Date Range**: ${activeSprint.start_date || 'N/A'} to ${activeSprint.end_date || 'N/A'}
- **Sprint Status**: \`${activeSprint.status || 'inactive'}\`

### Goals
${(activeSprint.goals || []).map((g: string) => `- ${g}`).join('\n') || '- None'}

### Sprint Backlog Tasks
| Task Name | Current Status |
|---|---|
`;
const backlog = activeSprint.sprint_backlog || [];
for (const task of backlog) {
  sprintStatusContent += `| \`${task.task}\` | \`${task.status}\` |\n`;
}
if (backlog.length === 0) sprintStatusContent += `| - | - |\n`;
updateGeneratedSection(path.join(DASHBOARD_DIR, 'sprint-status.md'), sprintStatusContent, 'Sprint Status');

// 4. Parse and Filter PR Reviews
function parsePrReviews(prReviewsDir: string): any[] {
  const prs = [];
  if (fs.existsSync(prReviewsDir)) {
    const files = fs.readdirSync(prReviewsDir);
    for (const file of files) {
      if (file.startsWith('pr-') && file.endsWith('.md')) {
        try {
          const fileContent = fs.readFileSync(path.join(prReviewsDir, file), 'utf-8');
          const parts = fileContent.split('---');
          if (parts.length >= 3) {
            const frontmatter = parse(parts[1]);
            if (frontmatter.type === 'pr-review') {
              prs.push({
                pr: frontmatter.pr,
                author: frontmatter.author,
                risk: frontmatter.risk,
                date: frontmatter.date,
                status: frontmatter.status,
                title: fileContent.split('\n').find(l => l.startsWith('# PR Review:')) || `PR #${frontmatter.pr}`,
                body: fileContent,
                changedFiles: extractChangedFilesFromPrReview(fileContent)
              });
            }
          }
        } catch (e) {}
      }
    }
  }
  return prs;
}

function extractChangedFilesFromPrReview(content: string): string[] {
  const files: string[] = [];
  const lines = content.split('\n');
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('## Changed Files Inspect List')) {
      inList = true;
      continue;
    }
    if (inList && line.startsWith('##')) {
      inList = false;
    }
    if (inList && line.startsWith('- ')) {
      const match = line.match(/- `([^`]+)`/);
      if (match) {
        files.push(match[1]);
      }
    }
  }
  return files;
}

const openPrsList = parsePrReviews(PR_REVIEWS_DIR);

// Generate PR Review Queue Dashboard (Open reviews only)
let prQueueContent = `## Open PR Review Queue

| PR ID | Risk Level | Author | Review Status | Date |
|---|---|---|---|---|
`;
let openPrFound = false;
for (const pr of openPrsList) {
  if (pr.status !== 'merged') {
    prQueueContent += `| #${pr.pr} | **${pr.risk.toUpperCase()}** | ${pr.author} | \`${pr.status}\` | ${pr.date} |\n`;
    openPrFound = true;
  }
}
if (!openPrFound) {
  prQueueContent += `| - | - | - | - | - |\n`;
}
updateGeneratedSection(path.join(DASHBOARD_DIR, 'pr-review-queue.md'), prQueueContent, 'PR Review Queue');

// 5. Generate System Health Dashboard (the legacy system-health.md file)
let systemHealthContent = `## System Health Grid

| System | Configured Status | Current Branch | Last Action | Health Status |
|---|---|---|---|---|
`;
for (const sysId in ecosystemSystems) {
  const sys = ecosystemSystems[sysId];
  let healthIcon = '⏸️ Paused';
  if (sys.status === 'active') {
    healthIcon = '🟢 Active';
  } else if (sys.status === 'unmapped') {
    healthIcon = '🟡 Unmapped';
  }
  systemHealthContent += `| **${sys.name}** | \`${sys.status}\` | \`${sys.current_branch || 'none'}\` | ${sys.next_action || 'None'} | ${healthIcon} |\n`;
}
updateGeneratedSection(path.join(DASHBOARD_DIR, 'system-health.md'), systemHealthContent, 'System Health');

// Helper to count rows in table
function countTableRows(filePath: string): number {
  if (!fs.existsSync(filePath)) return 0;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  let rowCount = 0;
  let inTable = false;
  for (const line of lines) {
    if (line.includes('|---|---|') || line.includes('|---|')) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('|') && !line.includes('| - |') && !line.includes('|---|')) {
      rowCount++;
    }
    if (inTable && line.trim() === '') {
      inTable = false;
    }
  }
  return rowCount;
}

const completedTasks = backlog.filter((t: any) => t.status === 'done').length;
const totalTasks = backlog.length;
const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

// Load field trial metrics from active sprint registry
const fieldTrial = activeSprint.field_trial || {};
const fieldTrialTasks = backlog.filter((t: any) => (fieldTrial.work_items || []).includes(t.task));
const completedFieldTrialTasks = fieldTrialTasks.filter((t: any) => t.status === 'done').length;
const totalFieldTrialTasks = fieldTrialTasks.length;
const fieldTrialPercentage = totalFieldTrialTasks > 0 ? Math.round((completedFieldTrialTasks / totalFieldTrialTasks) * 100) : 0;

// 6. Generate Weekly Report Dashboard
let weeklyReportContent = `## Weekly Operating Metrics

- **Last Updated**: ${new Date().toISOString()}
- **Active Systems Count**: ${Object.keys(activeSystems).length || 0}
- **Active Sprint Progress**: ${completedTasks} / ${totalTasks} (${completionPercentage}%)
- **Field Trial Progress**: ${completedFieldTrialTasks} / ${totalFieldTrialTasks} (${fieldTrialPercentage}%)
`;
updateGeneratedSection(path.join(DASHBOARD_DIR, 'weekly-report.md'), weeklyReportContent, 'Weekly Report');

// Helper to update specific blocks in dashboard/index.md
function updateNamedSection(filePath: string, blockName: string, generatedContent: string) {
  const startMarker = `<!-- brainbench:generated:${blockName}:start -->`;
  const endMarker = `<!-- brainbench:generated:${blockName}:end -->`;

  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  } else {
    // create default skeleton
    content = `# BrainBench Dashboard Cockpit\n\n` +
      `<!-- brainbench:generated:visual-snapshot:start -->\n<!-- brainbench:generated:visual-snapshot:end -->\n\n` +
      `<!-- brainbench:generated:visual-sdlc-flow:start -->\n<!-- brainbench:generated:visual-sdlc-flow:end -->\n\n` +
      `<!-- brainbench:generated:visual-quality-gates:start -->\n<!-- brainbench:generated:visual-quality-gates:end -->\n\n` +
      `<!-- brainbench:generated:visual-system-health:start -->\n<!-- brainbench:generated:visual-system-health:end -->\n\n` +
      `<!-- brainbench:generated:visual-human-review:start -->\n<!-- brainbench:generated:visual-human-review:end -->\n\n` +
      `<!-- brainbench:generated:visual-agent-advisory:start -->\n<!-- brainbench:generated:visual-agent-advisory:end -->\n\n` +
      `## Latest Operator Briefs\n` +
      `- [Daily Pulse (Operations)](file://${path.join(DASHBOARD_DIR, 'daily-report.md')})\n` +
      `- [Weekly Review (Trends)](file://${path.join(DASHBOARD_DIR, 'weekly-report.md')})\n\n` +
      `## Human Notes\n[Add manual notes here. These will be preserved by refresh script.]\n`;
  }

  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    const humanNotesIndex = content.indexOf('## Human Notes');
    if (humanNotesIndex !== -1) {
      content = content.slice(0, humanNotesIndex) +
                `${startMarker}\n\n${generatedContent.trim()}\n\n${endMarker}\n\n` +
                content.slice(humanNotesIndex);
    } else {
      content = content.trim() + `\n\n${startMarker}\n\n${generatedContent.trim()}\n\n${endMarker}\n`;
    }
  } else {
    content = content.slice(0, startIndex + startMarker.length) +
              '\n\n' + generatedContent.trim() + '\n\n' +
              content.slice(endIndex);
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[Dashboard Refresh] Updated block ${blockName} in ${filePath}`);
  } else {
    console.log(`[DRY RUN] Would write block ${blockName} to ${filePath}`);
  }
}

// 7. Migrate old index.md generated section if present
const indexPath = path.join(DASHBOARD_DIR, 'index.md');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf-8');
  if (content.includes('<!-- brainbench:generated:start -->')) {
    const startIdx = content.indexOf('<!-- brainbench:generated:start -->');
    const endIdx = content.indexOf('<!-- brainbench:generated:end -->');
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      const before = content.slice(0, startIdx);
      const after = content.slice(endIdx + '<!-- brainbench:generated:end -->'.length);
      const newSkeleton = 
        `<!-- brainbench:generated:visual-snapshot:start -->\n<!-- brainbench:generated:visual-snapshot:end -->\n\n` +
        `<!-- brainbench:generated:visual-sdlc-flow:start -->\n<!-- brainbench:generated:visual-sdlc-flow:end -->\n\n` +
        `<!-- brainbench:generated:visual-quality-gates:start -->\n<!-- brainbench:generated:visual-quality-gates:end -->\n\n` +
        `<!-- brainbench:generated:visual-system-health:start -->\n<!-- brainbench:generated:visual-system-health:end -->\n\n` +
        `<!-- brainbench:generated:visual-human-review:start -->\n<!-- brainbench:generated:visual-human-review:end -->\n\n` +
        `<!-- brainbench:generated:visual-agent-advisory:start -->\n<!-- brainbench:generated:visual-agent-advisory:end -->`;
      content = before + newSkeleton + after;
      if (!dryRun) {
        fs.writeFileSync(indexPath, content, 'utf-8');
        console.log(`[Dashboard Refresh] Migrated old generated section in ${indexPath}`);
      }
    }
  }
}

// 8. Generate dynamic Visual Cockpit Sections for index.md
const evidenceGapsCount = countTableRows(path.join(DASHBOARD_DIR, 'evidence-gaps.md'));
const decisionGapsCount = countTableRows(path.join(DASHBOARD_DIR, 'decision-gaps.md'));
const prQueueCount = countTableRows(path.join(DASHBOARD_DIR, 'pr-review-queue.md'));
const needsReviewTasks = backlog.filter((t: any) => t.status === 'ready-for-review');
const intakeCount = backlog.filter((t: any) => t.status === 'intake').length;
const triageCount = countTableRows(path.join(DASHBOARD_DIR, 'triage-suggestions.md'));
const inProgressCount = backlog.filter((t: any) => t.status === 'in-progress').length;
const doneCount = backlog.filter((t: any) => t.status === 'done').length;

// Executive Snapshot
const sprintSignal = completionPercentage >= 100 ? 'Complete' : (completionPercentage >= 70 ? 'On track' : 'Active');
const fieldTrialSignal = fieldTrialPercentage >= 100 ? 'Closed' : (fieldTrialPercentage > 0 ? 'Active' : 'Pending');
const openPrReviewsSignal = prQueueCount > 0 ? 'Attention' : 'Clear';
const evidenceGapsSignal = evidenceGapsCount > 0 ? 'Attention' : 'Clear';
const decisionGapsSignal = decisionGapsCount > 0 ? 'Attention' : 'Clear';
const needsHumanReviewSignal = needsReviewTasks.length > 0 
  ? `Review ${needsReviewTasks.map(t => t.task).join(', ')}` 
  : 'Clear';

const visualSnapshot = `## Operating Snapshot

| Area | Status | Signal |
|---|---|---|
| Active Sprint | ${completedTasks} / ${totalTasks} complete | ${sprintSignal} |
| Field Trial | ${completedFieldTrialTasks} / ${totalFieldTrialTasks} complete | ${fieldTrialSignal} |
| Open PR Reviews | ${prQueueCount} | ${openPrReviewsSignal} |
| Evidence Gaps | ${evidenceGapsCount} | ${evidenceGapsSignal} |
| Decision Gaps | ${decisionGapsCount} | ${decisionGapsSignal} |
| Needs Human Review | ${needsReviewTasks.length} | ${needsHumanReviewSignal} |`;

updateNamedSection(indexPath, 'visual-snapshot', visualSnapshot);

// SDLC Flow Chart
const visualSdlcFlow = `## SDLC Pipeline

\`\`\`mermaid
flowchart LR
  A["Intake: ${intakeCount}"] --> B["Triage: ${triageCount}"]
  B --> C["In Progress: ${inProgressCount}"]
  C --> D["PR Review: ${prQueueCount}"]
  D --> E["Evidence Gaps: ${evidenceGapsCount}"]
  E --> F["Decision Gaps: ${decisionGapsCount}"]
  F --> G["Done: ${doneCount}"]

  A:::active
  B:::active
  C:::active
  D:::${prQueueCount > 0 ? 'warning' : 'clear'}
  E:::${evidenceGapsCount > 0 ? 'warning' : 'clear'}
  F:::${decisionGapsCount > 0 ? 'warning' : 'clear'}
  G:::done

  classDef active fill:#f5f5f5,stroke:#555,stroke-width:1px;
  classDef clear fill:#eef7ee,stroke:#555,stroke-width:1px;
  classDef warning fill:#fff3cd,stroke:#555,stroke-width:1px;
  classDef done fill:#e8f0fe,stroke:#555,stroke-width:1px;
\`\`\``;

updateNamedSection(indexPath, 'visual-sdlc-flow', visualSdlcFlow);

// Quality Gates
const prReviewAction = prQueueCount > 0 ? 'Review pending PRs' : 'None';
const evidenceGapsAction = evidenceGapsCount > 0 ? 'Link required PR numbers to tasks' : 'None';
const decisionGapsAction = decisionGapsCount > 0 ? 'Review candidate decision drafts' : 'None';
const humanReviewAction = needsReviewTasks.length > 0 
  ? `Review ${needsReviewTasks.map(t => t.task).join(', ')}` 
  : 'None';

const visualQualityGates = `## Quality Gates

| Gate | Open | Status | Action |
|---|---:|---|---|
| PR Review | ${prQueueCount} | ${prQueueCount > 0 ? 'Attention' : 'Clear'} | ${prReviewAction} |
| Evidence Gaps | ${evidenceGapsCount} | ${evidenceGapsCount > 0 ? 'Attention' : 'Clear'} | ${evidenceGapsAction} |
| Decision Gaps | ${decisionGapsCount} | ${decisionGapsCount > 0 ? 'Attention' : 'Clear'} | ${decisionGapsAction} |
| Human Review | ${needsReviewTasks.length} | ${needsReviewTasks.length > 0 ? 'Attention' : 'Clear'} | ${humanReviewAction} |`;

updateNamedSection(indexPath, 'visual-quality-gates', visualQualityGates);

// System Health Helper Functions
function getSystemFocus(sysId: string, sys: any): string {
  if (sysId === 'brainbench') return 'Dashboard clarity';
  if (sysId === 'tessera') return 'Repo-to-use-case';
  if (sysId === 'flowright') return 'Product-fit map';
  if (sysId === 'toolsmith') return 'Utility roadmap';
  if (sysId === 'dax') return 'Verification harness';
  if (sysId === 'rook') return 'Verification harness';
  if (sysId === 'soothsayer') return 'Governance catalog';
  if (sysId === 'picobot') return 'Ingress bridge';
  if (sysId === 'pruningmypothos') return 'Documentation surface';
  
  if (sys.current_branch) {
    const base = sys.current_branch.replace(/^(feat|fix|refactor|chore)\//, '');
    return base.split('-').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
  return sys.next_action || 'None';
}

function getSystemRisk(sysId: string, sys: any, openPrs: any[]): string {
  const openPrForSys = openPrs.find(pr => {
    const contentLower = (pr.title + ' ' + pr.body + ' ' + pr.repo + ' ' + (pr.changedFiles || []).join(' ')).toLowerCase();
    return contentLower.includes(sysId) || contentLower.includes(sys.name.toLowerCase());
  });
  if (openPrForSys) {
    return openPrForSys.risk.toUpperCase();
  }
  if (sys.status === 'active') {
    return 'Low';
  }
  return 'Clear';
}

function getSystemEvidence(sysId: string, sys: any, evidenceGaps: any[]): string {
  const hasGaps = evidenceGaps.some(gap => {
    const gapContent = (gap.gapId + ' ' + gap.issue + ' ' + gap.description).toLowerCase();
    return gapContent.includes(sysId) || gapContent.includes(sys.name.toLowerCase());
  });
  if (hasGaps) {
    return 'Gaps Found';
  }
  return 'Complete';
}

// Parse evidence gaps from evidence-gaps.md to pass to helpers
function parseEvidenceGaps(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const gaps = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes('|---|---|') || line.includes('|---|')) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('|') && !line.includes('| - |') && !line.includes('|---|')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        gaps.push({
          gapId: parts[0],
          issue: parts[1],
          description: parts[2],
          status: parts[3]
        });
      }
    }
    if (inTable && line.trim() === '') {
      inTable = false;
    }
  }
  return gaps;
}

const evidenceGapsList = parseEvidenceGaps(path.join(DASHBOARD_DIR, 'evidence-gaps.md'));

// System Health Grid
let visualSystemHealth = `## System Health

| System | State | Current Focus | Risk | Evidence |
|---|---|---|---|---|
`;
for (const sysId in ecosystemSystems) {
  const sys = ecosystemSystems[sysId];
  const state = sys.status.charAt(0).toUpperCase() + sys.status.slice(1);
  const focus = getSystemFocus(sysId, sys);
  const risk = getSystemRisk(sysId, sys, openPrsList.filter(pr => pr.status !== 'merged'));
  const evidence = getSystemEvidence(sysId, sys, evidenceGapsList);
  visualSystemHealth += `| **${sys.name}** | ${state} | ${focus} | ${risk} | ${evidence} |\n`;
}

updateNamedSection(indexPath, 'visual-system-health', visualSystemHealth);

// Human Review Lane
function getHumanReviewAction(task: any): { reason: string, action: string } {
  if (task.task === 'issue-12') {
    return {
      reason: 'Backlog item still pending review',
      action: 'Confirm owner / close / move to next sprint'
    };
  }
  return {
    reason: `Task '${task.task}' is pending review`,
    action: `Audit status and validation logs for ${task.task}`
  };
}

let visualHumanReview = `## Needs Human Review

| Item | Reason | Suggested Action |
|---|---|---|
`;
if (needsReviewTasks.length > 0) {
  for (const t of needsReviewTasks) {
    const { reason, action } = getHumanReviewAction(t);
    visualHumanReview += `| ${t.task} | ${reason} | ${action} |\n`;
  }
} else {
  visualHumanReview += `| - | No tasks currently requiring human review. | None |\n`;
}

updateNamedSection(indexPath, 'visual-human-review', visualHumanReview);

// Agent Advisory Lane
let advisorySignals = '';
if (evidenceGapsCount === 0) {
  advisorySignals += `| No evidence gaps found | Evidence Agent | High | None |\n`;
} else {
  advisorySignals += `| ${evidenceGapsCount} evidence gaps found | Evidence Agent | High | Link PRs to backlog tasks |\n`;
}
if (decisionGapsCount === 0) {
  advisorySignals += `| No open decision gaps | Decision Gap Agent | High | None |\n`;
} else {
  advisorySignals += `| ${decisionGapsCount} decision gaps detected | Decision Gap Agent | High | Review generated decision drafts |\n`;
}
if (prQueueCount > 0) {
  advisorySignals += `| Open PR reviews pending | PR Review Agent | High | Check risk assessments for PRs |\n`;
} else {
  advisorySignals += `| Sprint state updated | PR Review Agent | Medium | Review if unexpected |\n`;
}

const visualAgentAdvisory = `## Agent Advisory

| Signal | Source | Confidence | Action |
|---|---|---|---|
${advisorySignals}`;

updateNamedSection(indexPath, 'visual-agent-advisory', visualAgentAdvisory);

// 9. Write execution log
const dateStr = new Date().toISOString().split('T')[0];
const agentRunFileName = `${dateStr}-dashboard-refresh.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: dashboard-refresh
date: ${dateStr}
status: success
---

# Agent Run: Dashboard Refresh

## Execution Summary
- **Date**: ${dateStr}
- **Dry Run**: ${dryRun}

## Actions Taken
- Refreshed all markdown dashboards under \`dashboard/\`, including visual cockpit index.md sections.
- Maintained human notes sections utilizing block-level boundary comments.
`;

if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Dashboard Refresh] Logged execution run to ${agentRunFilePath}`);
}

console.log('[Dashboard Refresh] Completed successfully.');
