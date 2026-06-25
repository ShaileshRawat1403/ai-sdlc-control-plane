import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parse, stringify } from 'yaml';
import { verifyWritePermission } from './shared/intelligence-rules';
import { updateGeneratedBlock } from './shared/generated-blocks';
import { parseMarkdown } from './shared/markdown-frontmatter';

const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DECISION_GAPS_DASHBOARD = path.join(REPO_ROOT, 'dashboard/decision-gaps.md');
const SCAN_STATE_PATH = path.join(REPO_ROOT, 'state/intelligence-scan.yml');
const DRAFTS_DIR = path.join(REPO_ROOT, 'brain/decisions/drafts');
const DECISIONS_DIR = path.join(REPO_ROOT, 'brain/decisions');
const DECISION_DRAFT_TEMPLATE = path.join(REPO_ROOT, 'control/templates/decision-draft.md');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const dryRun = process.env.DRY_RUN === 'true';
const agentKey = 'decision_gap_agent';

console.log('[Decision Gap] Inspecting commit diffs for governance changes...');

// 1. Enforce path rules
verifyWritePermission(agentKey, DECISION_GAPS_DASHBOARD);
verifyWritePermission(agentKey, SCAN_STATE_PATH);

// 2. Load scan state
let scanState: any = {
  last_decision_gap_scan: {
    sha: 'HEAD~1',
    scanned_at: new Date().toISOString(),
    result: 'success'
  },
  open_gaps: [],
  resolved_gaps: [],
  dismissed_gaps: []
};

if (fs.existsSync(SCAN_STATE_PATH)) {
  try {
    const raw = fs.readFileSync(SCAN_STATE_PATH, 'utf-8');
    const parsed = parse(raw);
    if (parsed) {
      if (parsed.last_decision_gap_scan) scanState.last_decision_gap_scan = parsed.last_decision_gap_scan;
      scanState.open_gaps = parsed.open_gaps || [];
      scanState.resolved_gaps = parsed.resolved_gaps || [];
      scanState.dismissed_gaps = parsed.dismissed_gaps || [];
    }
  } catch (e) {
    console.warn('Failed to parse scan state file, using defaults.');
  }
}

const lastSha = scanState.last_decision_gap_scan.sha;

// Get current HEAD SHA
let currentHead = 'HEAD';
try {
  currentHead = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
} catch (e) {
  console.warn('Failed to get HEAD SHA via git.');
}

console.log(`[Decision Gap] Comparing ${lastSha} -> ${currentHead}`);

// 3. Scan accepted/approved decisions for gap resolution
if (fs.existsSync(DECISIONS_DIR)) {
  const files = fs.readdirSync(DECISIONS_DIR);
  for (const file of files) {
    if (file.endsWith('.md') && !file.startsWith('draft-')) {
      const filePath = path.join(DECISIONS_DIR, file);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseMarkdown(fileContent);
      
      const status = (frontmatter.status || '').toLowerCase();
      if (status === 'accepted' || status === 'approved') {
        // Find if this accepted decision record references any open gap
        for (let i = scanState.open_gaps.length - 1; i >= 0; i--) {
          const gap = scanState.open_gaps[i];
          const referencesGap = 
            frontmatter.gap_id === gap.id ||
            frontmatter.resolves === gap.id ||
            fileContent.includes(gap.id) ||
            (gap.draft_file && fileContent.includes(path.basename(gap.draft_file)));
            
          if (referencesGap) {
            console.log(`[Decision Gap] Resolving gap ${gap.id} via accepted decision record ${file}`);
            scanState.resolved_gaps.push({
              id: gap.id,
              resolved_at: new Date().toISOString(),
              by_decision: file
            });
            scanState.open_gaps.splice(i, 1);
          }
        }
      }
    }
  }
}

// 4. Find files modified in comparison window
let changedFiles: string[] = [];
try {
  const diffOutput = execSync(`git diff --name-only ${lastSha}...${currentHead} || git diff --name-only ${lastSha} ${currentHead} || git diff --name-only HEAD~1 HEAD`, {
    cwd: REPO_ROOT,
    encoding: 'utf-8'
  });
  changedFiles = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
} catch (e) {
  console.warn('Git comparison failed. Scanning unstaged/staged status...');
  try {
    const statusOutput = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf-8' });
    changedFiles = statusOutput.split('\n').map(line => line.substring(3).trim()).filter(Boolean);
  } catch (err) {}
}

// Restricted folders/files requiring decisions when changed
const restrictedFolders = [
  'AGENTS.md',
  'CONTROL.md',
  'ecosystem.yml',
  'state/',
  '.github/workflows/',
  'control/rules/',
  'systems/',
  'brain/product-memory/',
  'brain/project-memory/'
];

// Filter for restricted paths (ignore decisions drafts or files under brain/decisions/)
const changedRestrictedFiles = changedFiles.filter(file => {
  if (file.startsWith('brain/decisions/')) return false;
  return restrictedFolders.some(folder => file.startsWith(folder) || file === folder);
});

// Helper to check if a file is a mechanical update
function isMechanicalUpdate(file: string): boolean {
  if (file === 'state/active-sprint.yml') return true;
  if (file === 'state/dashboard-state.yml') return true;
  if (file === 'state/memory-index.yml') return true;
  if (file === 'state/intelligence-scan.yml') return true;
  if (file.startsWith('dashboard/')) return true;
  if (file === 'bench/validation/evidence-index.md') return true;
  if (file === 'memory/active-context.md') return true;
  if (file.startsWith('bench/agent-runs/')) return true;
  if (file.startsWith('bench/pr-reviews/')) return true;
  if (file.startsWith('bench/validation/')) return true;
  return false;
}

// Map file to theme
function getFileTheme(file: string): string {
  if (file.startsWith('.github/workflows/')) {
    return 'workflow-automation';
  }
  if (file.startsWith('state/') || file.startsWith('memory/')) {
    return 'state-memory-model';
  }
  if (file.startsWith('systems/')) {
    return 'toolsmith-script-architecture';
  }
  return 'advisory-intelligence-governance';
}

// Group changed restricted files by theme
const filesByTheme: Record<string, string[]> = {};
for (const file of changedRestrictedFiles) {
  if (isMechanicalUpdate(file)) {
    console.log(`[Decision Gap] Ignoring mechanical/operational update: ${file}`);
    continue;
  }
  const theme = getFileTheme(file);
  if (!filesByTheme[theme]) {
    filesByTheme[theme] = [];
  }
  filesByTheme[theme].push(file);
}

// Process gaps for each theme
const dateStr = new Date().toISOString().split('T')[0];
const shortHead = currentHead.substring(0, 7);

for (const theme of Object.keys(filesByTheme)) {
  const gapId = `gap-${dateStr}-${shortHead}-${theme}`;
  
  // Check if this gap ID or theme is already resolved, dismissed, or open
  const isResolved = scanState.resolved_gaps.some((g: any) => g.id === gapId);
  const isDismissed = scanState.dismissed_gaps.some((g: any) => g.id === gapId);
  const existingOpenGap = scanState.open_gaps.find((g: any) => g.theme === theme);
  
  if (!isResolved && !isDismissed) {
    if (existingOpenGap) {
      // Append any new files to the existing open gap
      for (const f of filesByTheme[theme]) {
        if (!existingOpenGap.files.includes(f)) {
          existingOpenGap.files.push(f);
        }
      }
      console.log(`[Decision Gap] Appended new files to existing open gap for theme "${theme}"`);
    } else {
      // Create new open gap and generate themed draft
      const draftFileName = `draft-${shortHead}-${theme}.md`;
      const draftFilePath = path.join(DRAFTS_DIR, draftFileName);
      
      verifyWritePermission(agentKey, draftFilePath);
      
      const themeTitle = theme.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      
      const draftContent = `---
type: decision-draft
status: draft
gap_id: ${gapId}
theme: ${theme}
source_scan_sha: ${currentHead}
created_by: decision-gap-agent
created_at: ${dateStr}
requires_human_review: true
---

# Proposed Decision Draft: Governance Change for ${themeTitle}

> [!NOTE]
> This is a proposed architectural or governance decision drafted automatically by the Decision Gap Agent. It requires human review and modification before promotion to an accepted Decision Log.

## Context & Mismatched Changes
Modified restricted paths under theme \`${theme}\` in commit SHA \`${currentHead}\` without logging an accompanying architectural decision record:
${filesByTheme[theme].map(f => `- \`${f}\``).join('\n')}

## Proposed Choice
Documented changes to ${themeTitle} configurations.

## Rationale
Requires manual audit trail check by human operator.
`;

      if (!dryRun) {
        if (!fs.existsSync(DRAFTS_DIR)) {
          fs.mkdirSync(DRAFTS_DIR, { recursive: true });
        }
        fs.writeFileSync(draftFilePath, draftContent, 'utf-8');
        console.log(`[Decision Gap] Drafted candidate decision ADR in ${draftFilePath}`);
      } else {
        console.log(`[DRY RUN] Would draft candidate decision ADR in ${draftFilePath}`);
      }
      
      scanState.open_gaps.push({
        id: gapId,
        theme: theme,
        description: `Restricted paths under theme \`${theme}\` were modified in comparison window without a matching decision log.`,
        files: filesByTheme[theme],
        draft_file: `brain/decisions/drafts/${draftFileName}`
      });
    }
  }
}

// 5. Update Dashboard Output
let gapsMarkdown = `## Detected Decision Gaps

| Gap ID | Theme | Changed Paths | Description | Action Required |
|---|---|---|---|---|
`;
for (const gap of scanState.open_gaps) {
  const filesList = gap.files.map((f: string) => `\`${f}\``).join(', ');
  gapsMarkdown += `| \`${gap.id}\` | \`${gap.theme}\` | ${filesList} | ${gap.description} | Review Draft: [\`${path.basename(gap.draft_file)}\`](file://${path.join(REPO_ROOT, gap.draft_file)}) |\n`;
}
if (scanState.open_gaps.length === 0) {
  gapsMarkdown += `| - | - | - | All restricted configuration changes are backed by decision records. | - |\n`;
}

updateGeneratedBlock(DECISION_GAPS_DASHBOARD, gapsMarkdown, '');

// 6. Update Scan State File
const newScanState = {
  last_decision_gap_scan: {
    sha: currentHead !== 'HEAD' ? currentHead : lastSha,
    scanned_at: new Date().toISOString(),
    result: 'success'
  },
  open_gaps: scanState.open_gaps,
  resolved_gaps: scanState.resolved_gaps,
  dismissed_gaps: scanState.dismissed_gaps
};

if (!dryRun && currentHead !== 'HEAD') {
  fs.writeFileSync(SCAN_STATE_PATH, stringify(newScanState), 'utf-8');
  console.log(`[Decision Gap] Updated scan state with HEAD SHA ${newScanState.last_decision_gap_scan.sha}`);
}

// 7. Save Execution Run Log
const agentRunFileName = `${dateStr}-decision-gap.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: decision-gap
date: ${dateStr}
status: success
---

# Agent Run: Decision Gap Audit

## Execution Summary
- **Open Gaps**: ${scanState.open_gaps.length}
- **Resolved Gaps**: ${scanState.resolved_gaps.length}
- **Dismissed Gaps**: ${scanState.dismissed_gaps.length}
- **Comparison Window**: ${lastSha} -> ${currentHead}
- **Dry Run**: ${dryRun}

## Actions Taken
- Audited repository diff changes against risk-rules and grouped by theme.
- Generated draft candidate ADR files under \`brain/decisions/drafts/\`.
- Refreshed \`dashboard/decision-gaps.md\`.
`;

verifyWritePermission(agentKey, agentRunFilePath);
if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Decision Gap] Logged run success to ${agentRunFilePath}`);
}

console.log('[Decision Gap] Completed successfully.');
