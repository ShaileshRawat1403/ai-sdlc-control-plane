import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { verifyWritePermission } from './shared/intelligence-rules';
import { updateGeneratedBlock } from './shared/generated-blocks';
import { generateEvidenceGapId } from './shared/gap-id';
import { parseMarkdown } from './shared/markdown-frontmatter';

// Paths
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WORK_ITEMS_DIR = path.join(REPO_ROOT, 'bench/work-items');
const PR_REVIEWS_DIR = path.join(REPO_ROOT, 'bench/pr-reviews');
const VALIDATION_DIR = path.join(REPO_ROOT, 'bench/validation');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const EVIDENCE_GAPS_DASHBOARD = path.join(REPO_ROOT, 'dashboard/evidence-gaps.md');
const EVIDENCE_INDEX = path.join(REPO_ROOT, 'bench/validation/evidence-index.md');

const dryRun = process.env.DRY_RUN === 'true';
const agentKey = 'evidence_agent';

console.log('[Evidence Completeness] Scanning work items...');

// 1. Enforce path rules
verifyWritePermission(agentKey, EVIDENCE_GAPS_DASHBOARD);
verifyWritePermission(agentKey, EVIDENCE_INDEX);

interface GapFinding {
  id: string;
  issue: number;
  title: string;
  category: string;
  description: string;
  status: string;
}

const gaps: GapFinding[] = [];
const evidenceAssociations: { task: string, pr: string, validation: string, run: string }[] = [];

if (fs.existsSync(WORK_ITEMS_DIR)) {
  const files = fs.readdirSync(WORK_ITEMS_DIR);
  for (const file of files) {
    if (file.startsWith('issue-') && file.endsWith('.md')) {
      const filePath = path.join(WORK_ITEMS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter } = parseMarkdown(content);
      
      const issueNum = frontmatter.issue;
      const status = frontmatter.status || 'intake';
      const system = frontmatter.system || 'unset';
      const title = file.replace('.md', '');

      // Check if status requires evidence verification
      const targetStatuses = ['ready-for-review', 'in-review', 'done', 'close-requested'];
      if (targetStatuses.includes(status)) {
        let prFound = 'missing';
        let reviewLogFound = 'missing';
        let validationLogFound = 'missing';
        let agentRunLogFound = 'missing';

        // 1. Check PR mapping
        if (frontmatter.pr) {
          prFound = `#${frontmatter.pr}`;
          
          // Check review log
          const reviewLogPath = path.join(PR_REVIEWS_DIR, `pr-${frontmatter.pr}.md`);
          if (fs.existsSync(reviewLogPath)) {
            reviewLogFound = `[Review Log](file://${reviewLogPath})`;
          }
        } else {
          gaps.push({
            id: generateEvidenceGapId(issueNum, 'missing-pr-mapping'),
            issue: issueNum,
            title: `Issue #${issueNum} Missing PR Mapping`,
            category: 'evidence-gap',
            description: `Work item is in status \`${status}\` but has no mapped PR number in its frontmatter.`,
            status: status
          });
        }

        // 2. Check Validation Log
        // Search validation directory for logs matching this issue number
        let valFile = '';
        if (fs.existsSync(VALIDATION_DIR)) {
          const valFiles = fs.readdirSync(VALIDATION_DIR);
          for (const vf of valFiles) {
            if (vf.includes(`issue-${issueNum}`) || vf.includes(`refactor`) || vf.includes(`issue${issueNum}`)) {
              valFile = vf;
              break;
            }
          }
        }
        if (valFile) {
          validationLogFound = `[Validation Log](file://${path.join(VALIDATION_DIR, valFile)})`;
        } else {
          gaps.push({
            id: generateEvidenceGapId(issueNum, 'missing-validation-log'),
            issue: issueNum,
            title: `Issue #${issueNum} Missing Validation Log`,
            category: 'evidence-gap',
            description: `Work item is in status \`${status}\` but no matching validation log exists in \`bench/validation/\`.`,
            status: status
          });
        }

        // 3. Check Agent Run Log
        // Search agent runs for this issue number
        let runFile = '';
        if (fs.existsSync(AGENT_RUNS_DIR)) {
          const runFiles = fs.readdirSync(AGENT_RUNS_DIR);
          for (const rf of runFiles) {
            if (rf.includes(`issue-intake-${issueNum}`) || rf.includes(`pr-review-${frontmatter.pr}`)) {
              runFile = rf;
              break;
            }
          }
        }
        if (runFile) {
          agentRunLogFound = `[Agent Run Log](file://${path.join(AGENT_RUNS_DIR, runFile)})`;
        } else {
          gaps.push({
            id: generateEvidenceGapId(issueNum, 'missing-agent-run'),
            issue: issueNum,
            title: `Issue #${issueNum} Missing Agent Run Log`,
            category: 'evidence-gap',
            description: `Work item is in status \`${status}\` but has no tracked agent run execution logs under \`bench/agent-runs/\`.`,
            status: status
          });
        }

        evidenceAssociations.push({
          task: `[Issue #${issueNum}](file://${filePath})`,
          pr: prFound,
          validation: validationLogFound,
          run: agentRunLogFound
        });
      }
    }
  }
}

// 2. Generate Dashboard Output
let gapsMarkdown = `## Detected Evidence Gaps

| Gap ID | Issue | Description | Status |
|---|---|---|---|
`;
for (const gap of gaps) {
  gapsMarkdown += `| \`${gap.id}\` | #${gap.issue} | ${gap.description} | \`${gap.status}\` |\n`;
}
if (gaps.length === 0) gapsMarkdown += `| - | - | All active and closed tasks contain complete evidence logs. | - |\n`;

updateGeneratedBlock(EVIDENCE_GAPS_DASHBOARD, gapsMarkdown, '');

// 3. Generate Evidence Index Output
let indexMarkdown = `## Validation Evidence Map

| Task | Pull Request | Validation Evidence | Agent Run Log |
|---|---|---|---|
`;
for (const assoc of evidenceAssociations) {
  indexMarkdown += `| ${assoc.task} | ${assoc.pr} | ${assoc.validation} | ${assoc.run} |\n`;
}
if (evidenceAssociations.length === 0) indexMarkdown += `| - | - | - | - |\n`;

updateGeneratedBlock(EVIDENCE_INDEX, indexMarkdown, '');

// 4. Save Execution Run Log
const dateStr = new Date().toISOString().split('T')[0];
const agentRunFileName = `${dateStr}-evidence-completeness.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: evidence-completeness
date: ${dateStr}
status: success
---

# Agent Run: Evidence Completeness Scan

## Execution Summary
- **Gaps Detected**: ${gaps.length}
- **Ecosystem Backlog Inspected**: ${evidenceAssociations.length} tasks
- **Dry Run**: ${dryRun}

## Actions Taken
- Evaluated all work items in progress or ready for closure.
- Idempotently refreshed \`dashboard/evidence-gaps.md\`.
- Updated verification mapping index \`bench/validation/evidence-index.md\`.
`;

verifyWritePermission(agentKey, agentRunFilePath);
if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Evidence Completeness] Logged run success to ${agentRunFilePath}`);
}

console.log('[Evidence Completeness] Completed successfully.');
