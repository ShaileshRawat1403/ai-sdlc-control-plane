import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parse, stringify } from 'yaml';
import { verifyWritePermission } from './shared/intelligence-rules';
import { updateGeneratedBlock } from './shared/generated-blocks';
import { generateDecisionGapId } from './shared/gap-id';

// Paths
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const DECISION_GAPS_DASHBOARD = path.join(REPO_ROOT, 'dashboard/decision-gaps.md');
const SCAN_STATE_PATH = path.join(REPO_ROOT, 'state/intelligence-scan.yml');
const DRAFTS_DIR = path.join(REPO_ROOT, 'brain/decisions/drafts');
const DECISION_DRAFT_TEMPLATE = path.join(REPO_ROOT, 'control/templates/decision-draft.md');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const dryRun = process.env.DRY_RUN === 'true';
const agentKey = 'decision_gap_agent';

console.log('[Decision Gap] Inspecting commit diffs for governance changes...');

// 1. Enforce path rules
verifyWritePermission(agentKey, DECISION_GAPS_DASHBOARD);
verifyWritePermission(agentKey, SCAN_STATE_PATH);

// 2. Load last scanned SHA
let lastSha = 'HEAD~1';
if (fs.existsSync(SCAN_STATE_PATH)) {
  try {
    const scanData = parse(fs.readFileSync(SCAN_STATE_PATH, 'utf-8'));
    if (scanData && scanData.last_decision_gap_scan && scanData.last_decision_gap_scan.sha) {
      lastSha = scanData.last_decision_gap_scan.sha;
    }
  } catch (e) {
    console.warn('Failed to parse scan state file, falling back to HEAD~1.');
  }
}

// Get current HEAD SHA
let currentHead = 'HEAD';
try {
  currentHead = execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
} catch (e) {
  console.warn('Failed to get HEAD SHA via git.');
}

console.log(`[Decision Gap] Comparing ${lastSha} -> ${currentHead}`);

// 3. Find files modified in comparison window
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

// Mapped changes
const changedRestrictedFiles = changedFiles.filter(file => {
  return restrictedFolders.some(folder => file.startsWith(folder) || file === folder);
});

// Check if any decision logs were created/modified in the same window
const decisionLogsAdded = changedFiles.some(file => {
  return file.startsWith('brain/decisions/') && !file.includes('drafts/');
});

const gaps: { id: string, file: string, description: string, draftCreated: boolean }[] = [];

if (changedRestrictedFiles.length > 0 && !decisionLogsAdded) {
  console.log(`[Decision Gap] Touched restricted paths but no decision log was updated.`);
  
  for (const file of changedRestrictedFiles) {
    // Generate stable gap ID
    const shortHead = currentHead.substring(0, 7);
    const gapId = generateDecisionGapId(shortHead, file);
    
    // Create draft ADR candidate
    const draftFileName = `draft-${shortHead}-${path.basename(file)}`;
    const draftFilePath = path.join(DRAFTS_DIR, draftFileName);
    
    verifyWritePermission(agentKey, draftFilePath);

    let draftCreated = false;
    if (fs.existsSync(DECISION_DRAFT_TEMPLATE)) {
      let draftTemplate = fs.readFileSync(DECISION_DRAFT_TEMPLATE, 'utf-8');
      const dateStr = new Date().toISOString().split('T')[0];
      
      draftTemplate = draftTemplate
        .replace('[Title]', `Governance Change for ${path.basename(file)}`)
        .replace('[YYYY-MM-DD-short-title-draft]', `draft-${shortHead}-${path.basename(file).replace('.md', '').toLowerCase()}`)
        .replace('[YYYY-MM-DD]', dateStr)
        .replace('[System name]', 'BrainBench')
        .replace('[Describe the modified paths that triggered this decision gap and what changes were detected.]', `Modified restricted path \`${file}\` in commit SHA \`${currentHead}\` without logging an accompanying architectural decision record.`)
        .replace('[State the proposed choice to document.]', `Documented changes to ${path.basename(file)}.`)
        .replace('[Explain why this choice aligns with control plane requirements.]', `Requires manual audit trail check by human operator.`);

      if (!dryRun) {
        fs.writeFileSync(draftFilePath, draftTemplate, 'utf-8');
        draftCreated = true;
        console.log(`[Decision Gap] Drafted candidate decision ADR in ${draftFilePath}`);
      } else {
        console.log(`[DRY RUN] Would draft candidate decision ADR in ${draftFilePath}`);
      }
    }

    gaps.push({
      id: gapId,
      file: file,
      description: `Restricted path \`${file}\` was modified in comparison window, but no matching decision log was submitted in \`brain/decisions/\`.`,
      draftCreated: draftCreated
    });
  }
} else {
  console.log('[Decision Gap] No decision gaps found. Either no restricted paths changed, or decision log was appropriately updated.');
}

// 4. Update Dashboard Output
let gapsMarkdown = `## Detected Decision Gaps

| Gap ID | Changed Path | Description | Action Required |
|---|---|---|---|
`;
for (const gap of gaps) {
  const draftPointer = gap.draftCreated ? `Review Draft: \`brain/decisions/drafts/draft-${currentHead.substring(0, 7)}-...\`` : 'Create Decision Log';
  gapsMarkdown += `| \`${gap.id}\` | \`${gap.file}\` | ${gap.description} | ${draftPointer} |\n`;
}
if (gaps.length === 0) gapsMarkdown += `| - | - | All restricted configuration changes are backed by decision records. | - |\n`;

updateGeneratedBlock(DECISION_GAPS_DASHBOARD, gapsMarkdown, '');

// 5. Update Scan State
const newScanState = {
  last_decision_gap_scan: {
    sha: currentHead !== 'HEAD' ? currentHead : lastSha,
    scanned_at: new Date().toISOString(),
    result: 'success'
  }
};

if (!dryRun && currentHead !== 'HEAD') {
  fs.writeFileSync(SCAN_STATE_PATH, stringify(newScanState), 'utf-8');
  console.log(`[Decision Gap] Updated last scanned SHA cache to ${newScanState.last_decision_gap_scan.sha}`);
}

// 6. Save Execution Run Log
const dateStr = new Date().toISOString().split('T')[0];
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
- **Gaps Detected**: ${gaps.length}
- **Comparison Window**: ${lastSha} -> ${currentHead}
- **Dry Run**: ${dryRun}

## Actions Taken
- Audited repository diff changes against risk-rules.
- Generated draft candidate ADR files under \`brain/decisions/drafts/\` for restricted updates.
- Refreshed \`dashboard/decision-gaps.md\`.
`;

verifyWritePermission(agentKey, agentRunFilePath);
if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Decision Gap] Logged run success to ${agentRunFilePath}`);
}

console.log('[Decision Gap] Completed successfully.');
