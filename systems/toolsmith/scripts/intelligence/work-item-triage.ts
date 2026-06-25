import * as fs from 'fs';
import * as path from 'path';
import { verifyWritePermission } from './shared/intelligence-rules';
import { updateGeneratedBlock } from './shared/generated-blocks';
import { parseMarkdown } from './shared/markdown-frontmatter';

// Paths
const REPO_ROOT = path.resolve(__dirname, '../../../../');
const WORK_ITEMS_DIR = path.join(REPO_ROOT, 'bench/work-items');
const TRIAGE_DASHBOARD = path.join(REPO_ROOT, 'dashboard/triage-suggestions.md');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

const dryRun = process.env.DRY_RUN === 'true';
const agentKey = 'triage_agent';

console.log('[Work Item Triage] Triaging work items...');

// 1. Enforce path rules
verifyWritePermission(agentKey, TRIAGE_DASHBOARD);

interface TriageSuggestion {
  issue: number;
  fileName: string;
  suggestedPriority: string;
  reason: string;
  confidence: string;
  needsReview: boolean;
}

const suggestions: TriageSuggestion[] = [];

if (fs.existsSync(WORK_ITEMS_DIR)) {
  const files = fs.readdirSync(WORK_ITEMS_DIR);
  for (const file of files) {
    if (file.startsWith('issue-') && file.endsWith('.md')) {
      const filePath = path.join(WORK_ITEMS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const { frontmatter, body } = parseMarkdown(content);
      
      const issueNum = frontmatter.issue;
      const currentPriority = frontmatter.priority || 'unset';
      const currentOwner = frontmatter.owner || 'unset';
      const currentSystem = frontmatter.system || 'unset';
      const status = frontmatter.status || 'intake';

      // We only triage active intake/in-progress items
      if (status === 'intake' || status === 'in-progress' || status === 'ready-for-review') {
        let suggestedPriority = 'low';
        let reason = 'Default low priority assignment.';
        let confidence = 'low';
        let needsReview = false;

        // Triage logic: prioritize based on system
        if (currentSystem === 'dax' || currentSystem === 'rook' || currentSystem === 'brainbench') {
          suggestedPriority = 'high';
          reason = `Touches active core SDLC verification system: ${currentSystem}.`;
          confidence = 'high';
        } else if (currentSystem === 'soothsayer' || currentSystem === 'flowright') {
          suggestedPriority = 'medium';
          reason = `System ${currentSystem} is currently paused, but active sprint prep is emerging.`;
          confidence = 'medium';
        }

        // Flag missing details
        const missingDetails: string[] = [];
        if (currentOwner === 'unset') missingDetails.push('unassigned owner');
        if (currentPriority === 'unset') missingDetails.push('unassigned priority');
        if (currentSystem === 'unset') missingDetails.push('unassigned system');
        
        if (missingDetails.length > 0) {
          reason += ` Warning: has ${missingDetails.join(', ')}.`;
          needsReview = true;
        }

        // 2. Update Work Item Generated Section (Advisory Triage)
        const advisoryTriageMarkdown = `
### Advisory Triage Suggestions
- **Suggested Priority**: \`${suggestedPriority}\`
- **Triage Confidence**: \`${confidence}\`
- **Triage Reason**: ${reason}
- **Action Required**: Human operator should review and update frontmatter settings.
`;

        verifyWritePermission(agentKey, filePath);
        if (!dryRun) {
          // Write only inside generated section of the work item file
          updateGeneratedBlock(filePath, advisoryTriageMarkdown, '');
        } else {
          console.log(`[DRY RUN] Would update generated block in ${filePath}:\n${advisoryTriageMarkdown}`);
        }

        suggestions.push({
          issue: issueNum,
          fileName: file,
          suggestedPriority: suggestedPriority,
          reason: reason,
          confidence: confidence,
          needsReview: needsReview
        });
      }
    }
  }
}

// 3. Update Dashboard Output
let suggestionsMarkdown = `## Active Triage Suggestions

| Issue | Filename | Suggested Priority | Confidence | Advisory Notes | Needs Review |
|---|---|---|---|---|---|
`;
for (const sug of suggestions) {
  suggestionsMarkdown += `| #${sug.issue} | [\`${sug.fileName}\`](file://${path.join(WORK_ITEMS_DIR, sug.fileName)}) | \`${sug.suggestedPriority}\` | \`${sug.confidence}\` | ${sug.reason} | ${sug.needsReview ? '⚠️ Yes' : 'No'} |\n`;
}
if (suggestions.length === 0) suggestionsMarkdown += `| - | - | - | - | No active intake/in-progress work items to triage. | - |\n`;

updateGeneratedBlock(TRIAGE_DASHBOARD, suggestionsMarkdown, '');

// 4. Save Execution Run Log
const dateStr = new Date().toISOString().split('T')[0];
const agentRunFileName = `${dateStr}-work-item-triage.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: work-item-triage
date: ${dateStr}
status: success
---

# Agent Run: Work Item Triage Scan

## Execution Summary
- **Items Triaged**: ${suggestions.length}
- **Action Required Flags**: ${suggestions.filter(s => s.needsReview).length}
- **Dry Run**: ${dryRun}

## Actions Taken
- Evaluated active work items for missing data.
- Appended advisory triage suggestions to each work item generated block.
- Updated \`dashboard/triage-suggestions.md\`.
`;

verifyWritePermission(agentKey, agentRunFilePath);
if (!dryRun) {
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Work Item Triage] Logged run success to ${agentRunFilePath}`);
}

console.log('[Work Item Triage] Completed successfully.');
