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

// Helper to extract backtick command codes or code blocks and render them as <kbd> tags
function formatCommands(text: string): string {
  if (!text) return '';
  
  // 1. Replace multiline code blocks (e.g. ```bash\nbun run test\n```)
  let formatted = text.replace(/```(?:bash|sh|json)?\n([\s\S]*?)\n```/g, (match, code) => {
    const lines = code.split('\n').map((line: string) => line.trim()).filter(Boolean);
    return lines.map((line: string) => `<kbd>${line}</kbd>`).join(' · ');
  });

  // 2. Replace inline backtick codes (e.g. `bun run test`)
  formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
    const trimmed = code.trim();
    // Check if it looks like a command, script, path to script, or an action command
    const isCmd = /^(bun|npm|npx|git|dax|node|bunx|python|bash|sh|make)\b|[\w.-]+\.(ts|js|sh|py)\b/.test(trimmed);
    if (isCmd) {
      return `<kbd>${trimmed}</kbd>`;
    }
    return `\`${trimmed}\``;
  });

  return formatted;
}

// Function to compile the entire cockpit dashboard/index.md in the correct order
function compileIndexFile(
  filePath: string,
  sections: {
    visualSnapshot: string,
    visualSdlcFlow: string,
    repoInsightMatrix: string,
    qualityGatesContent: string,
    visualHumanReview: string,
    repoActionLanes: string,
    visualAgentAdvisory: string,
    repoRecommendedActions: string
  }
) {
  let operatorNotesContent = '\nUse this section for human observations during dashboard clarity trials.\n';
  let humanNotesContent = '\n[Add manual notes here. These will be preserved by refresh script.]\n';

  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // Extract operator notes
    const opStartMarker = '<!-- brainbench:manual:operator-notes:start -->';
    const opEndMarker = '<!-- brainbench:manual:operator-notes:end -->';
    const opStartIdx = fileContent.indexOf(opStartMarker);
    const opEndIdx = fileContent.indexOf(opEndMarker);
    if (opStartIdx !== -1 && opEndIdx !== -1 && opStartIdx < opEndIdx) {
      operatorNotesContent = fileContent.slice(opStartIdx + opStartMarker.length, opEndIdx);
    }

    // Extract human notes
    const hnMarker = '## Human Notes';
    const hnIdx = fileContent.indexOf(hnMarker);
    if (hnIdx !== -1) {
      humanNotesContent = fileContent.slice(hnIdx + hnMarker.length);
    }
  }

  // Trim whitespace around extracted manual content
  operatorNotesContent = operatorNotesContent.trim();
  if (operatorNotesContent) {
    operatorNotesContent = '\n' + operatorNotesContent + '\n';
  } else {
    operatorNotesContent = '\nUse this section for human observations during dashboard clarity trials.\n';
  }
  
  humanNotesContent = humanNotesContent.trim();
  if (humanNotesContent) {
    humanNotesContent = '\n' + humanNotesContent + '\n';
  } else {
    humanNotesContent = '\n[Add manual notes here. These will be preserved by refresh script.]\n';
  }

  const generatedTimestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const content = `# BrainBench V0.4.3: Visual Command Cockpit\n` +
    `Generated: ${generatedTimestamp}\n\n` +
    `<!-- brainbench:generated:visual-snapshot:start -->\n\n${sections.visualSnapshot.trim()}\n\n<!-- brainbench:generated:visual-snapshot:end -->\n\n` +
    `<!-- brainbench:generated:visual-sdlc-flow:start -->\n\n${sections.visualSdlcFlow.trim()}\n\n<!-- brainbench:generated:visual-sdlc-flow:end -->\n\n` +
    `<!-- brainbench:generated:repo-insight-matrix:start -->\n\n${sections.repoInsightMatrix.trim()}\n\n<!-- brainbench:generated:repo-insight-matrix:end -->\n\n` +
    `<!-- brainbench:generated:quality-gates-by-repo:start -->\n\n${sections.qualityGatesContent.trim()}\n\n<!-- brainbench:generated:quality-gates-by-repo:end -->\n\n` +
    `<!-- brainbench:generated:visual-human-review:start -->\n\n${sections.visualHumanReview.trim()}\n\n<!-- brainbench:generated:visual-human-review:end -->\n\n` +
    `<!-- brainbench:generated:repo-action-lanes:start -->\n\n${sections.repoActionLanes.trim()}\n\n<!-- brainbench:generated:repo-action-lanes:end -->\n\n` +
    `<!-- brainbench:generated:visual-agent-advisory:start -->\n\n${sections.visualAgentAdvisory.trim()}\n\n<!-- brainbench:generated:visual-agent-advisory:end -->\n\n` +
    `<!-- brainbench:generated:repo-recommended-actions:start -->\n\n${sections.repoRecommendedActions.trim()}\n\n<!-- brainbench:generated:repo-recommended-actions:end -->\n\n` +
    `## Latest Operator Briefs\n` +
    `- [Daily Pulse (Operations)](file://${path.join(DASHBOARD_DIR, 'daily-report.md')})\n` +
    `- [Weekly Review (Trends)](file://${path.join(DASHBOARD_DIR, 'weekly-report.md')})\n\n` +
    `## Operator Notes\n\n<!-- brainbench:manual:operator-notes:start -->${operatorNotesContent}<!-- brainbench:manual:operator-notes:end -->\n\n` +
    `## Human Notes${humanNotesContent}`;

  if (!dryRun) {
    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`[Dashboard Refresh] Successfully updated cockpit at ${filePath}`);
  } else {
    console.log(`[DRY RUN] Would write cockpit to ${filePath}:\n${content}`);
  }
}

const indexPath = path.join(DASHBOARD_DIR, 'index.md');

// Helper to parse systems status.md files
function parseSystemStatusFile(sysId: string, ecosystemSys: any): any {
  const filePath = path.join(REPO_ROOT, `systems/${sysId}/status.md`);
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  const result: any = {
    name: ecosystemSys.name || sysId,
    role: ecosystemSys.role || 'Unknown',
    status: ecosystemSys.status || 'Unknown',
    current_branch: ecosystemSys.current_branch || 'Unknown',
    next_action: ecosystemSys.next_action || 'Unknown',
    objective: 'Unknown',
    last_updated: null,
    freshness: 'Freshness: unknown'
  };

  if (!content) {
    return result;
  }

  // 1. Try parsing YAML frontmatter if present
  const parts = content.split('---');
  if (parts.length >= 3 && content.startsWith('---')) {
    try {
      const frontmatter = parse(parts[1]);
      if (frontmatter) {
        if (frontmatter.system) result.name = frontmatter.system;
        if (frontmatter.status) result.status = frontmatter.status;
        if (frontmatter.branch) result.current_branch = frontmatter.branch;
        if (frontmatter.objective) result.objective = frontmatter.objective;
        if (frontmatter.next_action) result.next_action = frontmatter.next_action;
        if (frontmatter.last_updated) {
          result.last_updated = frontmatter.last_updated;
          const updatedDate = new Date(frontmatter.last_updated);
          const now = new Date();
          const diffTime = Math.abs(now.getTime() - updatedDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays > 7) {
            result.freshness = 'Freshness: stale';
          } else {
            result.freshness = 'Freshness: fresh';
          }
        }
      }
    } catch (e) {}
  }

  // 2. Parse known headings if missing / fallback
  const getSectionText = (heading: string): string => {
    const regex = new RegExp(`##\\s+${heading}\\s*\\n\\n([^#]+)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  };

  const roleText = getSectionText('Role');
  if (roleText) result.role = roleText;

  const statusText = getSectionText('Current status');
  if (statusText) result.status = statusText.replace(/\.$/, '');

  const branchText = getSectionText('Current branch');
  if (branchText) result.current_branch = branchText;

  const objectiveText = getSectionText('Current objective') || getSectionText('Objective');
  if (objectiveText) result.objective = objectiveText;

  const nextActionText = getSectionText('Next action');
  if (nextActionText) result.next_action = nextActionText;

  return result;
}

// Parse work items from bench/work-items/*.md
function parseWorkItems(workItemsDir: string): any[] {
  const items: any[] = [];
  if (fs.existsSync(workItemsDir)) {
    const files = fs.readdirSync(workItemsDir);
    for (const file of files) {
      if (file.endsWith('.md') && !file.startsWith('README') && !file.startsWith('parking-lot') && !file.startsWith('later-not-now')) {
        try {
          const content = fs.readFileSync(path.join(workItemsDir, file), 'utf-8');
          const parts = content.split('---');
          if (parts.length >= 3) {
            const frontmatter = parse(parts[1]);
            if (frontmatter && frontmatter.type === 'work-item') {
              items.push({
                issue: frontmatter.issue,
                status: frontmatter.status || 'Unknown',
                system: frontmatter.system || 'Unmapped',
                priority: frontmatter.priority || 'Unknown',
                owner: frontmatter.owner || 'Unknown',
                title: content.split('\n').find(l => l.startsWith('# Work Item:'))?.replace('# Work Item:', '').trim() || `Issue #${frontmatter.issue}`,
                filePath: path.join(workItemsDir, file)
              });
            }
          }
        } catch (e) {}
      }
    }
  }
  return items;
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

// Parse evidence index to map tasks to their validation outputs
function parseEvidenceIndex(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const list = [];
  let inTable = false;
  for (const line of lines) {
    if (line.includes('|---|---|') || line.includes('|---|')) {
      inTable = true;
      continue;
    }
    if (inTable && line.startsWith('|') && !line.includes('| - |') && !line.includes('|---|')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 4) {
        list.push({
          task: parts[0],
          pr: parts[1],
          validationLog: parts[2],
          runLog: parts[3]
        });
      }
    }
    if (inTable && line.trim() === '') {
      inTable = false;
    }
  }
  return list;
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

const evidenceGapsList = countTableRows(path.join(DASHBOARD_DIR, 'evidence-gaps.md')) > 0 
  ? parseEvidenceGaps(path.join(DASHBOARD_DIR, 'evidence-gaps.md')) 
  : [];
const decisionGapsList = countTableRows(path.join(DASHBOARD_DIR, 'decision-gaps.md')) > 0 
  ? parseEvidenceGaps(path.join(DASHBOARD_DIR, 'decision-gaps.md')) 
  : [];

// Parse evidence index and work items
const workItemsList = parseWorkItems(path.join(REPO_ROOT, 'bench/work-items'));
const evidenceIndexList = parseEvidenceIndex(path.join(REPO_ROOT, 'bench/validation/evidence-index.md'));

// Group work items by system
const workItemsBySys: Record<string, any[]> = {};
for (const item of workItemsList) {
  let sysId = item.system.toLowerCase();
  if (!ecosystemSystems[sysId]) {
    sysId = 'unmapped';
  }
  if (!workItemsBySys[sysId]) {
    workItemsBySys[sysId] = [];
  }
  workItemsBySys[sysId].push(item);
}

// Build repository insights model
const systemsInsights: Record<string, any> = {};
for (const sysId in ecosystemSystems) {
  const ecosystemSys = ecosystemSystems[sysId];
  const parsedStatus = parseSystemStatusFile(sysId, ecosystemSys);
  const sysWorkItems = workItemsBySys[sysId] || [];
  
  const systemEvidenceGaps = evidenceGapsList.filter(gap => {
    const gapContent = (gap.gapId + ' ' + gap.issue + ' ' + gap.description).toLowerCase();
    return gapContent.includes(sysId) || gapContent.includes(parsedStatus.name.toLowerCase());
  });
  
  const systemDecisionGaps = decisionGapsList.filter(gap => {
    const gapContent = (gap.gapId + ' ' + gap.theme + ' ' + gap.description).toLowerCase();
    return gapContent.includes(sysId) || gapContent.includes(parsedStatus.name.toLowerCase());
  });
  
  systemsInsights[sysId] = {
    id: sysId,
    statusInfo: parsedStatus,
    workItems: sysWorkItems,
    hasEvidenceGaps: systemEvidenceGaps.length > 0,
    hasDecisionGaps: systemDecisionGaps.length > 0,
    evidenceGaps: systemEvidenceGaps,
    decisionGaps: systemDecisionGaps
  };
}

// Include Virtual Unmapped system if there are unmapped items
if (workItemsBySys['unmapped'] && workItemsBySys['unmapped'].length > 0) {
  systemsInsights['unmapped'] = {
    id: 'unmapped',
    statusInfo: {
      name: 'Unmapped',
      role: 'Unknown',
      status: 'unmapped',
      current_branch: 'none',
      next_action: 'Assign to a system / repository',
      objective: 'Resolve unmapped tasks',
      last_updated: null,
      freshness: 'Freshness: unknown'
    },
    workItems: workItemsBySys['unmapped'],
    hasEvidenceGaps: false,
    hasDecisionGaps: false,
    evidenceGaps: [],
    decisionGaps: []
  };
}

// 1. Operating Snapshot
const activeSystemsCount = Object.keys(ecosystemSystems).filter(id => ecosystemSystems[id].status === 'active').length;
const sprintSignal = completionPercentage >= 100 ? 'Complete' : (completionPercentage >= 70 ? 'In Progress' : 'Active');
const fieldTrialSignal = fieldTrialPercentage >= 100 ? 'Complete' : (fieldTrialPercentage > 0 ? 'Active' : 'Pending');
const openPrReviewsSignal = prQueueCount > 0 ? 'Attention' : 'Clear';
const evidenceGapsSignal = evidenceGapsCount > 0 ? 'Attention' : 'Clear';
const decisionGapsSignal = decisionGapsCount > 0 ? 'Attention' : 'Clear';
const needsHumanReviewSignal = needsReviewTasks.length > 0 ? 'Attention' : 'Clear';

const snapshotCards: string[] = [];

// 1. Active Systems
snapshotCards.push(`> [!NOTE]
> ### Active Systems: ${activeSystemsCount}
> Status: \`Running\``);

// 2. Active Sprint
snapshotCards.push(`> [!TIP]
> ### Active Sprint: ${completedTasks} / ${totalTasks}
> Progress: \`${completionPercentage}%\``);

// 3. Field Trial
snapshotCards.push(`> [!TIP]
> ### Field Trial: ${completedFieldTrialTasks} / ${totalFieldTrialTasks}
> Progress: \`${fieldTrialPercentage}%\``);

// 4. Open Evidence Gaps
const evidenceGapsCardType = evidenceGapsCount > 0 ? 'WARNING' : 'NOTE';
snapshotCards.push(`> [!${evidenceGapsCardType}]
> ### Open Evidence Gaps: ${evidenceGapsCount}
> Status: \`${evidenceGapsSignal}\``);

// 5. Open Decision Gaps
const decisionGapsCardType = decisionGapsCount > 0 ? 'WARNING' : 'NOTE';
snapshotCards.push(`> [!${decisionGapsCardType}]
> ### Open Decision Gaps: ${decisionGapsCount}
> Status: \`${decisionGapsSignal}\``);

// 6. Human Review Queue
const humanReviewCardType = needsReviewTasks.length > 0 ? 'WARNING' : 'NOTE';
const humanReviewAction = needsReviewTasks.length > 0 
  ? `Action: Review ${needsReviewTasks.map(t => `\`${t.task}\``).join(', ')}`
  : `Status: \`Clear\``;
snapshotCards.push(`> [!${humanReviewCardType}]
> ### Human Review: ${needsReviewTasks.length}
> ${humanReviewAction}`);

const visualSnapshot = `## Operating Snapshot\n\n` + snapshotCards.join('\n\n');

// 2. Visual SDLC Pipeline Flowchart
const visualSdlcFlow = `## Visual SDLC Pipeline

\`\`\`mermaid
flowchart LR
  subgraph Execution [Execution]
    direction LR
    Intake["Intake: ${intakeCount}"] --> Triage["Triage: ${triageCount}"] --> InProgress["In Progress: ${inProgressCount}"]
  end
  subgraph Governance [Governance]
    direction LR
    PrReview["PR Review: ${prQueueCount}"] --> Evidence["Evidence: ${evidenceGapsCount}"] --> Decision["Decision: ${decisionGapsCount}"]
  end
  subgraph Closure [Closure]
    Done["Done: ${doneCount}"]
  end
  InProgress --> PrReview
  Decision --> Done

  classDef active fill:#f5f5f5,stroke:#555,stroke-width:1px;
  classDef clear fill:#eef7ee,stroke:#555,stroke-width:1px;
  classDef warning fill:#fff3cd,stroke:#555,stroke-width:1px;
  classDef done fill:#e8f0fe,stroke:#555,stroke-width:1px;

  Intake:::active
  Triage:::active
  InProgress:::active
  PrReview:::${prQueueCount > 0 ? 'warning' : 'clear'}
  Evidence:::${evidenceGapsCount > 0 ? 'warning' : 'clear'}
  Decision:::${decisionGapsCount > 0 ? 'warning' : 'clear'}
  Done:::done
\`\`\``;

// Helpers for repo health & risk mapping
function getSystemRisk(sysId: string, sys: any, openPrs: any[], systemWorkItems: any[], hasEvidenceGaps: boolean, hasDecisionGaps: boolean): string {
  const openPrForSys = openPrs.find(pr => {
    const contentLower = (pr.title + ' ' + pr.body + ' ' + pr.repo + ' ' + (pr.changedFiles || []).join(' ')).toLowerCase();
    return contentLower.includes(sysId) || contentLower.includes(sys.name.toLowerCase());
  });
  if (openPrForSys && openPrForSys.risk === 'high') {
    return 'HIGH';
  }
  
  const hasHumanReviewItem = systemWorkItems.some(item => item.status === 'ready-for-review');
  const openPrMedium = openPrForSys && openPrForSys.risk === 'medium';
  if (hasHumanReviewItem || openPrMedium) {
    return 'Medium';
  }

  if (sys.status === 'paused' || sys.status === 'unmapped') {
    if (!openPrForSys && !hasHumanReviewItem) {
      return 'Clear';
    }
  }

  if (sys.status === 'active' && systemWorkItems.length === 0 && !openPrForSys) {
    return 'Unknown';
  }

  if (!hasEvidenceGaps && !hasDecisionGaps) {
    return 'Low';
  }

  return 'Low';
}

function getSystemEvidence(sysId: string, sys: any, evidenceGaps: any[], systemWorkItems: any[], evidenceList: any[]): string {
  const hasGaps = evidenceGaps.some(gap => {
    const gapContent = (gap.gapId + ' ' + gap.issue + ' ' + gap.description).toLowerCase();
    return gapContent.includes(sysId) || gapContent.includes(sys.name.toLowerCase());
  });
  if (hasGaps) {
    return 'Gaps Found';
  }

  const hasReviewItem = systemWorkItems.some(item => item.status === 'ready-for-review');
  if (hasReviewItem) {
    const hasMissingPr = evidenceList.some(ev => (ev.task.toLowerCase().includes(sysId) || ev.task.toLowerCase().includes('issue-12')) && ev.pr === 'missing');
    if (hasMissingPr) {
      return 'Unknown';
    }
  }

  return 'Complete';
}

function getAdvisorySignal(sysId: string, sys: any, systemWorkItems: any[], freshness: string): string {
  const hasHumanReview = systemWorkItems.some(t => t.status === 'ready-for-review');
  if (hasHumanReview) {
    return 'Needs human review';
  }
  if (freshness === 'Freshness: stale') {
    return 'Status stale';
  }
  if (!sys.next_action || sys.next_action === 'None' || sys.next_action === 'none') {
    const doneTasks = systemWorkItems.filter(t => t.status === 'done');
    if (doneTasks.length > 0) {
      if (sysId === 'tessera') return 'Repo-to-use-case brief complete';
      if (sysId === 'flowright') return 'Product-fit map complete';
      if (sysId === 'toolsmith') return 'Dual role clarified';
      return `${doneTasks[0].title.trim()} complete`;
    }
    return 'No active work';
  }
  
  if (sysId === 'brainbench') {
    return 'Dashboard clarity trial active';
  }
  if (sysId === 'dax' || sysId === 'rook') {
    return 'Verification harness active';
  }
  
  return sys.current_objective || sys.objective || 'No active work';
}

function getNextAction(sysId: string, sys: any, systemWorkItems: any[]): string {
  const hasHumanReview = systemWorkItems.some(t => t.status === 'ready-for-review');
  if (hasHumanReview) {
    return 'Confirm close / carry forward';
  }
  if (sysId === 'brainbench') return 'Operate from cockpit';
  if (sysId === 'tessera') return 'Candidate for next build slice';
  if (sysId === 'flowright') return 'Review product positioning';
  if (sysId === 'toolsmith') return 'Decide next utility category';
  
  return sys.next_action || 'None';
}

// 3. Generate Repo/System Insight Matrix
let repoInsightMatrix = `## Repo / System Insight Matrix

| Repo/System | Work State | Risk | Evidence | Decision | Advisory Signal | Next Action |
|---|---|---|---|---|---|---|
`;

for (const id in systemsInsights) {
  const insight = systemsInsights[id];
  const name = insight.statusInfo.name;
  
  let workState = 'Idle';
  const hasInProgress = insight.workItems.some((t: any) => t.status === 'in-progress');
  const hasReview = insight.workItems.some((t: any) => t.status === 'ready-for-review');
  const hasDone = insight.workItems.length > 0 && insight.workItems.every((t: any) => t.status === 'done');
  
  if (hasReview) {
    workState = 'Review';
  } else if (hasInProgress) {
    workState = 'Active';
  } else if (hasDone) {
    workState = 'Done';
  } else if (insight.statusInfo.status === 'paused') {
    workState = 'Paused';
  } else if (insight.statusInfo.status === 'unmapped') {
    workState = 'Unmapped';
  } else if (insight.workItems.length === 0) {
    workState = 'No active work';
  }
  
  const risk = getSystemRisk(id, insight.statusInfo, openPrsList.filter(pr => pr.status !== 'merged'), insight.workItems, insight.hasEvidenceGaps, insight.hasDecisionGaps);
  const evidence = getSystemEvidence(id, insight.statusInfo, evidenceGapsList, insight.workItems, evidenceIndexList);
  const decision = insight.hasDecisionGaps ? 'Gaps Found' : 'Clear';
  const advisory = getAdvisorySignal(id, insight.statusInfo, insight.workItems, insight.statusInfo.freshness);
  const nextAction = getNextAction(id, insight.statusInfo, insight.workItems);
  
  let displayName = `**${name}**`;
  if (hasReview) {
    const reviewTasks = insight.workItems.filter((t: any) => t.status === 'ready-for-review');
    displayName = `**${name}** (${reviewTasks.map((t: any) => 'Issue #' + t.issue).join(', ')})`;
  }
  
  repoInsightMatrix += `| ${displayName} | ${workState} | ${risk} | ${evidence} | ${decision} | ${formatCommands(advisory)} | ${formatCommands(nextAction)} |\n`;
}

// 4. Generate Repo-Specific Action Lanes
let repoActionLanes = `## Repo Action Lanes

`;
for (const id in systemsInsights) {
  const insight = systemsInsights[id];
  const name = insight.statusInfo.name;

  let workState = 'Idle';
  const hasInProgress = insight.workItems.some((t: any) => t.status === 'in-progress');
  const hasReview = insight.workItems.some((t: any) => t.status === 'ready-for-review');
  const hasDone = insight.workItems.length > 0 && insight.workItems.every((t: any) => t.status === 'done');
  
  if (hasReview) {
    workState = 'Review';
  } else if (hasInProgress) {
    workState = 'Active';
  } else if (hasDone) {
    workState = 'Done';
  } else if (insight.statusInfo.status === 'paused') {
    workState = 'Paused';
  } else if (insight.statusInfo.status === 'unmapped') {
    workState = 'Unmapped';
  } else if (insight.workItems.length === 0) {
    workState = 'No active work';
  }

  const risk = getSystemRisk(id, insight.statusInfo, openPrsList.filter(pr => pr.status !== 'merged'), insight.workItems, insight.hasEvidenceGaps, insight.hasDecisionGaps);
  const evidence = getSystemEvidence(id, insight.statusInfo, evidenceGapsList, insight.workItems, evidenceIndexList);
  const evidenceStr = evidence === 'Complete' ? 'Evidence Complete' : (evidence === 'Gaps Found' ? 'Evidence Gaps' : 'Evidence Unknown');

  repoActionLanes += `<details>\n`;
  repoActionLanes += `<summary><b>${name}</b> — ${workState} · ${risk} · ${evidenceStr}</summary>\n\n`;
  repoActionLanes += `| Signal | Status | Action |\n`;
  repoActionLanes += `|---|---|---|\n`;
  
  if (insight.workItems.length > 0) {
    for (const task of insight.workItems) {
      let taskStatus = 'Open';
      let taskAction = 'None';
      if (task.status === 'done') {
        taskStatus = 'Complete';
        if (id === 'tessera') taskAction = 'Convert into build issue';
        else if (id === 'flowright') taskAction = 'Review product-fit assumptions';
        else if (id === 'toolsmith') taskAction = 'Select first repo-helper utility';
        else taskAction = 'No action';
      } else if (task.status === 'ready-for-review') {
        taskStatus = 'Review';
        taskAction = `Confirm close / move to next sprint`;
      } else if (task.status === 'in-progress') {
        taskStatus = 'Active';
        taskAction = 'Continue sprint backlog tasks';
      }
      repoActionLanes += `| ${task.title} | ${taskStatus} | ${formatCommands(taskAction)} |\n`;
    }
  } else {
    const statusCap = insight.statusInfo.status.charAt(0).toUpperCase() + insight.statusInfo.status.slice(1);
    repoActionLanes += `| Objective: ${insight.statusInfo.objective} | ${statusCap} | ${formatCommands(insight.statusInfo.next_action)} |\n`;
  }
  
  const freshnessCap = insight.statusInfo.freshness.replace('Freshness: ', '').charAt(0).toUpperCase() + insight.statusInfo.freshness.replace('Freshness: ', '').slice(1);
  const freshnessAction = freshnessCap === 'Stale' ? 'Update status.md file' : 'No action';
  repoActionLanes += `| Freshness | ${freshnessCap} | ${formatCommands(freshnessAction)} |\n`;
  
  const hasGaps = insight.hasEvidenceGaps;
  const evidenceStatus = hasGaps ? 'Attention' : 'Complete';
  const evidenceAction = hasGaps ? 'Link required PR numbers to tasks' : 'No action';
  repoActionLanes += `| Evidence | ${evidenceStatus} | ${formatCommands(evidenceAction)} |\n`;
  
  const hasDecGaps = insight.hasDecisionGaps;
  const decStatus = hasDecGaps ? 'Attention' : 'Clear';
  const decAction = hasDecGaps ? 'Review candidate decision drafts' : 'No action';
  repoActionLanes += `| Decision gaps | ${decStatus} | ${formatCommands(decAction)} |\n`;
  
  if (insight.statusInfo.status === 'paused' || insight.statusInfo.status === 'unmapped') {
    let nextCandidateAction = 'Define input/output contract';
    if (id === 'flowright') nextCandidateAction = 'Create use-case prioritization note';
    else if (id === 'toolsmith') nextCandidateAction = 'Define utility backlog';
    repoActionLanes += `| Next candidate | Open | ${formatCommands(nextCandidateAction)} |\n`;
  }
  
  repoActionLanes += `\n</details>\n\n`;
}

// 5. Generate Quality Gates by Repo
let qualityGatesContent = `## Quality Gates by Repo

| Repo/System | PR Review | Evidence | Decision Gap | Human Review | Overall |
|---|---|---|---|---|---|
`;

for (const id in systemsInsights) {
  const insight = systemsInsights[id];
  const name = insight.statusInfo.name;
  
  const openPrForSys = openPrsList.find(pr => {
    if (pr.status === 'merged') return false;
    const contentLower = (pr.title + ' ' + pr.body + ' ' + pr.repo + ' ' + (pr.changedFiles || []).join(' ')).toLowerCase();
    return contentLower.includes(id) || contentLower.includes(insight.statusInfo.name.toLowerCase());
  });
  
  let prReviewGate = 'Clear';
  if (openPrForSys) {
    prReviewGate = openPrForSys.risk === 'high' ? 'High Risk' : 'Attention';
  } else if (insight.workItems.some((t: any) => t.status === 'done')) {
    prReviewGate = 'Complete';
  }

  let evidenceGate = 'Clear';
  if (insight.hasEvidenceGaps) {
    evidenceGate = 'Attention';
  } else if (getSystemEvidence(id, insight.statusInfo, evidenceGapsList, insight.workItems, evidenceIndexList) === 'Unknown') {
    evidenceGate = 'Attention';
  } else if (insight.workItems.some((t: any) => t.status === 'done')) {
    evidenceGate = 'Complete';
  }

  let decisionGate = 'Clear';
  if (insight.hasDecisionGaps) {
    decisionGate = 'Attention';
  }

  let humanReviewGate = 'None';
  if (insight.workItems.some((t: any) => t.status === 'ready-for-review')) {
    humanReviewGate = 'Watch';
  } else if (insight.workItems.some((t: any) => t.status === 'in-progress')) {
    humanReviewGate = 'Watch';
  }

  let overallGate = 'Healthy';
  if (prReviewGate.includes('Attention') || prReviewGate.includes('High') || evidenceGate === 'Attention' || decisionGate === 'Attention' || insight.workItems.some((t: any) => t.status === 'ready-for-review')) {
    overallGate = 'Attention';
  } else if (insight.workItems.some((t: any) => t.status === 'in-progress')) {
    overallGate = 'Stable';
  }
  
  qualityGatesContent += `| **${name}** | ${prReviewGate} | ${evidenceGate} | ${decisionGate} | ${humanReviewGate} | ${overallGate} |\n`;
}

// 6. Generate Human Review Lane
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
    visualHumanReview += `| ${t.task} | ${reason} | ${formatCommands(action)} |\n`;
  }
} else {
  visualHumanReview += `| - | No tasks currently requiring human review. | None |\n`;
}

// 7. Generate Agent Advisory Signals
let visualAgentAdvisory = `## Agent Advisory Signals

| Agent | Repo/System | Signal | Confidence | Operator Action |
|---|---|---|---|---|
`;

let triageSignalsFound = false;
if (fs.existsSync(path.join(DASHBOARD_DIR, 'triage-suggestions.md'))) {
  try {
    const triageSuggestionsContent = fs.readFileSync(path.join(DASHBOARD_DIR, 'triage-suggestions.md'), 'utf-8');
    const lines = triageSuggestionsContent.split('\n');
    let inTable = false;
    for (const line of lines) {
      if (line.includes('|---|') || line.includes('|---|---|')) {
        inTable = true;
        continue;
      }
      if (inTable && line.startsWith('|') && !line.includes('|---|') && !line.includes('| - |')) {
        const parts = line.split('|').map(p => p.trim()).filter(Boolean);
        if (parts.length >= 6) {
          const issueNum = parts[0].replace('#', '');
          const matchedItem = workItemsList.find(w => w.issue.toString() === issueNum);
          const sysName = matchedItem ? matchedItem.system : 'ToolSmith';
          
          let operatorAction = 'Review triage suggestions';
          if (sysName.toLowerCase() === 'toolsmith') {
            operatorAction = 'Review roadmap boundary';
          }
          
          visualAgentAdvisory += `| Triage Agent | ${sysName} | ${formatCommands(parts[4])} | ${parts[3]} | ${formatCommands(operatorAction)} |\n`;
          triageSignalsFound = true;
        }
      }
      if (inTable && line.trim() === '') {
        inTable = false;
      }
    }
  } catch (e) {}
}

if (evidenceGapsCount > 0) {
  for (const gap of evidenceGapsList) {
    const matchedItem = workItemsList.find(w => w.issue.toString() === gap.issue.replace('#', ''));
    const sysName = matchedItem ? matchedItem.system : 'Sprint';
    visualAgentAdvisory += `| Evidence Agent | ${sysName} | ${formatCommands(gap.description)} | High | ${formatCommands('Link PRs to backlog tasks')} |\n`;
  }
} else {
  visualAgentAdvisory += `| Evidence Agent | Tessera | Evidence complete | High | No action |\n`;
}

if (decisionGapsCount > 0) {
  for (const gap of decisionGapsList) {
    visualAgentAdvisory += `| Decision Gap Agent | Sprint | ${formatCommands(gap.description)} | High | Review generated decision drafts |\n`;
  }
} else {
  visualAgentAdvisory += `| Decision Gap Agent | BrainBench | No open decision gaps | High | No action |\n`;
}

const briefAction = needsReviewTasks.length > 0 
  ? `Review ${needsReviewTasks.map(t => '#' + t.task.replace('issue-', '')).join(', ')}`
  : 'No action';
visualAgentAdvisory += `| Weekly Brief | Sprint | ${completedTasks} / ${totalTasks} complete | High | ${formatCommands(briefAction)} |\n`;

// 8. Generate Repo-Specific Recommended Actions
let repoRecommendedActions = `## Recommended Actions

`;

for (const id in systemsInsights) {
  const insight = systemsInsights[id];
  const name = insight.statusInfo.name;
  
  repoRecommendedActions += `### ${name}\n\n`;
  
  if (id === 'brainbench') {
    repoRecommendedActions += `- Continue dashboard clarity trial from \`dashboard/index.md\`.\n`;
    repoRecommendedActions += `- Avoid new architecture changes until one normal sprint completes.\n\n`;
  } else if (id === 'tessera') {
    repoRecommendedActions += `- Convert repo-to-use-case concept into a scoped build task.\n`;
    repoRecommendedActions += `- Define input/output schema before implementation.\n\n`;
  } else if (id === 'flowright') {
    repoRecommendedActions += `- Review use-case map for product-fit clarity.\n`;
    repoRecommendedActions += `- Identify top 3 use cases worth building into examples.\n\n`;
  } else if (id === 'toolsmith') {
    repoRecommendedActions += `- Select first repo-helper utility.\n`;
    repoRecommendedActions += `- Keep internal BrainBench scripts separate from future product utilities.\n\n`;
  } else {
    const hasReview = insight.workItems.some((t: any) => t.status === 'ready-for-review');
    const hasInProgress = insight.workItems.some((t: any) => t.status === 'in-progress');
    if (hasReview) {
      repoRecommendedActions += `- Verify validation logs for pending review tasks.\n`;
      repoRecommendedActions += `- Confirm owner, close, or move to next sprint.\n\n`;
    } else if (hasInProgress) {
      repoRecommendedActions += `- Continue sprint backlog execution.\n\n`;
    } else {
      repoRecommendedActions += `- No action needed. System is stable.\n\n`;
    }
  }
}

// Compile the entire cockpit file
compileIndexFile(indexPath, {
  visualSnapshot,
  visualSdlcFlow,
  repoInsightMatrix,
  qualityGatesContent,
  visualHumanReview,
  repoActionLanes,
  visualAgentAdvisory,
  repoRecommendedActions
});

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
