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

// 4. Generate PR Review Queue Dashboard
let prQueueContent = `## Open PR Review Queue

| PR ID | Risk Level | Author | Review Status | Date |
|---|---|---|---|---|
`;
let openPrFound = false;
if (fs.existsSync(PR_REVIEWS_DIR)) {
  const files = fs.readdirSync(PR_REVIEWS_DIR);
  for (const file of files) {
    if (file.startsWith('pr-') && file.endsWith('.md')) {
      try {
        const fileContent = fs.readFileSync(path.join(PR_REVIEWS_DIR, file), 'utf-8');
        const parts = fileContent.split('---');
        if (parts.length >= 3) {
          const frontmatter = parse(parts[1]);
          if (frontmatter.type === 'pr-review') {
            prQueueContent += `| #${frontmatter.pr} | **${frontmatter.risk.toUpperCase()}** | ${frontmatter.author} | \`${frontmatter.status}\` | ${frontmatter.date} |\n`;
            openPrFound = true;
          }
        }
      } catch (e) {}
    }
  }
}
if (!openPrFound) {
  prQueueContent += `| - | - | - | - | - |\n`;
}
updateGeneratedSection(path.join(DASHBOARD_DIR, 'pr-review-queue.md'), prQueueContent, 'PR Review Queue');

// 5. Generate System Health Dashboard
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

// 7. Generate dashboard/index.md Entry Point
const evidenceGapsCount = countTableRows(path.join(DASHBOARD_DIR, 'evidence-gaps.md'));
const decisionGapsCount = countTableRows(path.join(DASHBOARD_DIR, 'decision-gaps.md'));
const prQueueCount = countTableRows(path.join(DASHBOARD_DIR, 'pr-review-queue.md'));
const needsReviewTasks = backlog.filter((t: any) => t.status === 'ready-for-review');

let indexContent = `## Operational Control Surface
- **Last Updated**: ${new Date().toISOString()}

### Current Status
- **Active Sprint**: \`${activeSprint.name || 'none'}\` (\`${activeSprint.status || 'inactive'}\`)
- **Ecosystem Registry**: ${Object.keys(activeSystems).length} active systems

### Progress Metrics
- **Active Sprint Progress**: ${completedTasks} / ${totalTasks} (${completionPercentage}%)
- **Field Trial Progress**: ${completedFieldTrialTasks} / ${totalFieldTrialTasks} (${fieldTrialPercentage}%)

### Quality Gates Summary
- **Open Risks (PR Queue)**: ${prQueueCount} items in review
- **Open Evidence Gaps**: ${evidenceGapsCount} items flagged
- **Open Decision Gaps**: ${decisionGapsCount} items flagged

### Needs Human Review
`;
if (needsReviewTasks.length > 0) {
  for (const t of needsReviewTasks) {
    indexContent += `- Task \`${t.task}\` is \`ready-for-review\`\n`;
  }
} else {
  indexContent += `- No tasks currently requiring human review.\n`;
}

indexContent += `
### Latest Operator Brief
Refer to the detailed [Weekly Report](file://${path.join(DASHBOARD_DIR, 'weekly-report.md')}) for the operational brief.
`;

updateGeneratedSection(path.join(DASHBOARD_DIR, 'index.md'), indexContent, 'BrainBench Dashboard Index');

// 8. Write execution log
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
- Refreshed all markdown dashboards under \`dashboard/\`, including new \`index.md\` control surface.
- Maintained human notes sections utilizing boundary comments.
`;

if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Dashboard Refresh] Logged execution run to ${agentRunFilePath}`);
}

console.log('[Dashboard Refresh] Completed successfully.');
