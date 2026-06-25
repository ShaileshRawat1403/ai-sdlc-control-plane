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
      `<!-- brainbench:generated:repo-insight-matrix:start -->\n<!-- brainbench:generated:repo-insight-matrix:end -->\n\n` +
      `<!-- brainbench:generated:repo-action-lanes:start -->\n<!-- brainbench:generated:repo-action-lanes:end -->\n\n` +
      `<!-- brainbench:generated:quality-gates-by-repo:start -->\n<!-- brainbench:generated:quality-gates-by-repo:end -->\n\n` +
      `<!-- brainbench:generated:visual-human-review:start -->\n<!-- brainbench:generated:visual-human-review:end -->\n\n` +
      `<!-- brainbench:generated:visual-agent-advisory:start -->\n<!-- brainbench:generated:visual-agent-advisory:end -->\n\n` +
      `<!-- brainbench:generated:repo-recommended-actions:start -->\n<!-- brainbench:generated:repo-recommended-actions:end -->\n\n` +
      `## Latest Operator Briefs\n` +
      `- [Daily Pulse (Operations)](file://${path.join(DASHBOARD_DIR, 'daily-report.md')})\n` +
      `- [Weekly Review (Trends)](file://${path.join(DASHBOARD_DIR, 'weekly-report.md')})\n\n` +
      `## Operator Notes\n\n<!-- brainbench:manual:operator-notes:start -->\n\nUse this section for human observations during dashboard clarity trials.\n\n<!-- brainbench:manual:operator-notes:end -->\n\n` +
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
  
  // Remove old single-marker if it's there
  if (content.includes('<!-- brainbench:generated:start -->')) {
    const startIdx = content.indexOf('<!-- brainbench:generated:start -->');
    const endIdx = content.indexOf('<!-- brainbench:generated:end -->');
    if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
      content = content.slice(0, startIdx) + content.slice(endIdx + '<!-- brainbench:generated:end -->'.length);
    }
  }

  // Ensure all the new V0.4.2 block markers exist in the file
  const requiredBlocks = [
    'visual-snapshot',
    'visual-sdlc-flow',
    'repo-insight-matrix',
    'repo-action-lanes',
    'quality-gates-by-repo',
    'visual-human-review',
    'visual-agent-advisory',
    'repo-recommended-actions'
  ];

  let modified = false;
  for (const block of requiredBlocks) {
    const startMarker = `<!-- brainbench:generated:${block}:start -->`;
    const endMarker = `<!-- brainbench:generated:${block}:end -->`;
    if (!content.includes(startMarker) || !content.includes(endMarker)) {
      const insertIndex = content.indexOf('## Latest Operator Briefs') !== -1 
        ? content.indexOf('## Latest Operator Briefs') 
        : (content.indexOf('## Operator Notes') !== -1 
           ? content.indexOf('## Operator Notes') 
           : content.indexOf('## Human Notes'));
      
      const newBlockStr = `${startMarker}\n${endMarker}\n\n`;
      if (insertIndex !== -1) {
        content = content.slice(0, insertIndex) + newBlockStr + content.slice(insertIndex);
      } else {
        content = content.trim() + `\n\n${newBlockStr}`;
      }
      modified = true;
    }
  }

  // Ensure "## Operator Notes" block exists
  if (!content.includes('## Operator Notes')) {
    const insertIndex = content.indexOf('## Human Notes');
    const opNotesStr = `## Operator Notes\n\n<!-- brainbench:manual:operator-notes:start -->\n\nUse this section for human observations during dashboard clarity trials.\n\n<!-- brainbench:manual:operator-notes:end -->\n\n`;
    if (insertIndex !== -1) {
      content = content.slice(0, insertIndex) + opNotesStr + content.slice(insertIndex);
    } else {
      content = content.trim() + `\n\n${opNotesStr}`;
    }
    modified = true;
  }

  if (modified && !dryRun) {
    fs.writeFileSync(indexPath, content, 'utf-8');
    console.log(`[Dashboard Refresh] Migrated index.md to include all visual cockpit blocks.`);
  }
}

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

const visualSnapshot = `## Operating Snapshot

| Signal | Value | Status |
|---|---:|---|
| Active Systems | ${activeSystemsCount} | Running |
| Active Sprint Progress | ${completedTasks} / ${totalTasks} | ${sprintSignal} |
| Field Trial Progress | ${completedFieldTrialTasks} / ${totalFieldTrialTasks} | ${fieldTrialSignal} |
| Open Evidence Gaps | ${evidenceGapsCount} | ${evidenceGapsSignal} |
| Open Decision Gaps | ${decisionGapsCount} | ${decisionGapsSignal} |
| Human Review Items | ${needsReviewTasks.length} | ${needsHumanReviewSignal} |`;

updateNamedSection(indexPath, 'visual-snapshot', visualSnapshot);

// 2. Visual SDLC Pipeline Flowchart
const visualSdlcFlow = `## Visual SDLC Pipeline

\`\`\`mermaid
flowchart LR
  A[Intake] --> B[Triage]
  B --> C[In Progress]
  C --> D[PR Review]
  D --> E[Validation]
  E --> F[Decision Check]
  F --> G[Done]

  A --> A1["Open: ${intakeCount}"]
  D --> D1["PRs: ${prQueueCount}"]
  E --> E1["Evidence Gaps: ${evidenceGapsCount}"]
  F --> F1["Decision Gaps: ${decisionGapsCount}"]
  G --> G1["Done: ${doneCount}"]

  A:::active
  B:::active
  C:::active
  D:::${prQueueCount > 0 ? 'warning' : 'clear'}
  E:::${evidenceGapsCount > 0 ? 'warning' : 'clear'}
  F:::${decisionGapsCount > 0 ? 'warning' : 'clear'}
  G:::done

  A1:::active
  D1:::${prQueueCount > 0 ? 'warning' : 'clear'}
  E1:::${evidenceGapsCount > 0 ? 'warning' : 'clear'}
  F1:::${decisionGapsCount > 0 ? 'warning' : 'clear'}
  G1:::done

  classDef active fill:#f5f5f5,stroke:#555,stroke-width:1px;
  classDef clear fill:#eef7ee,stroke:#555,stroke-width:1px;
  classDef warning fill:#fff3cd,stroke:#555,stroke-width:1px;
  classDef done fill:#e8f0fe,stroke:#555,stroke-width:1px;
\`\`\``;

updateNamedSection(indexPath, 'visual-sdlc-flow', visualSdlcFlow);

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
  
  repoInsightMatrix += `| ${displayName} | ${workState} | ${risk} | ${evidence} | ${decision} | ${advisory} | ${nextAction} |\n`;
}

updateNamedSection(indexPath, 'repo-insight-matrix', repoInsightMatrix);

// 4. Generate Repo-Specific Action Lanes
let repoActionLanes = `## Repo Action Lanes

`;
for (const id in systemsInsights) {
  const insight = systemsInsights[id];
  const name = insight.statusInfo.name;
  
  repoActionLanes += `### ${name}\n\n`;
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
      repoActionLanes += `| ${task.title} | ${taskStatus} | ${taskAction} |\n`;
    }
  } else {
    const statusCap = insight.statusInfo.status.charAt(0).toUpperCase() + insight.statusInfo.status.slice(1);
    repoActionLanes += `| Objective: ${insight.statusInfo.objective} | ${statusCap} | ${insight.statusInfo.next_action} |\n`;
  }
  
  const freshnessCap = insight.statusInfo.freshness.replace('Freshness: ', '').charAt(0).toUpperCase() + insight.statusInfo.freshness.replace('Freshness: ', '').slice(1);
  const freshnessAction = freshnessCap === 'Stale' ? 'Update status.md file' : 'No action';
  repoActionLanes += `| Freshness | ${freshnessCap} | ${freshnessAction} |\n`;
  
  const hasGaps = insight.hasEvidenceGaps;
  const evidenceStatus = hasGaps ? 'Attention' : 'Complete';
  const evidenceAction = hasGaps ? 'Link required PR numbers to tasks' : 'No action';
  repoActionLanes += `| Evidence | ${evidenceStatus} | ${evidenceAction} |\n`;
  
  const hasDecGaps = insight.hasDecisionGaps;
  const decStatus = hasDecGaps ? 'Attention' : 'Clear';
  const decAction = hasDecGaps ? 'Review candidate decision drafts' : 'No action';
  repoActionLanes += `| Decision gaps | ${decStatus} | ${decAction} |\n`;
  
  if (insight.statusInfo.status === 'paused' || insight.statusInfo.status === 'unmapped') {
    let nextCandidateAction = 'Define input/output contract';
    if (id === 'flowright') nextCandidateAction = 'Create use-case prioritization note';
    else if (id === 'toolsmith') nextCandidateAction = 'Define utility backlog';
    repoActionLanes += `| Next candidate | Open | ${nextCandidateAction} |\n`;
  }
  
  repoActionLanes += `\n`;
}

updateNamedSection(indexPath, 'repo-action-lanes', repoActionLanes);

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

updateNamedSection(indexPath, 'quality-gates-by-repo', qualityGatesContent);

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
    visualHumanReview += `| ${t.task} | ${reason} | ${action} |\n`;
  }
} else {
  visualHumanReview += `| - | No tasks currently requiring human review. | None |\n`;
}

updateNamedSection(indexPath, 'visual-human-review', visualHumanReview);

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
          
          visualAgentAdvisory += `| Triage Agent | ${sysName} | ${parts[4]} | ${parts[3]} | ${operatorAction} |\n`;
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
    visualAgentAdvisory += `| Evidence Agent | ${sysName} | ${gap.description} | High | Link PRs to backlog tasks |\n`;
  }
} else {
  visualAgentAdvisory += `| Evidence Agent | Tessera | Evidence complete | High | No action |\n`;
}

if (decisionGapsCount > 0) {
  for (const gap of decisionGapsList) {
    visualAgentAdvisory += `| Decision Gap Agent | Sprint | ${gap.description} | High | Review generated decision drafts |\n`;
  }
} else {
  visualAgentAdvisory += `| Decision Gap Agent | BrainBench | No open decision gaps | High | No action |\n`;
}

const briefAction = needsReviewTasks.length > 0 
  ? `Review ${needsReviewTasks.map(t => '#' + t.task.replace('issue-', '')).join(', ')}`
  : 'No action';
visualAgentAdvisory += `| Weekly Brief | Sprint | ${completedTasks} / ${totalTasks} complete | High | ${briefAction} |\n`;

updateNamedSection(indexPath, 'visual-agent-advisory', visualAgentAdvisory);

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

updateNamedSection(indexPath, 'repo-recommended-actions', repoRecommendedActions);

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
