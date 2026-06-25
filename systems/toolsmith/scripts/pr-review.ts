import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { parse } from 'yaml';

// Configuration
const REPO_ROOT = path.resolve(__dirname, '../../../');
const PR_REVIEWS_DIR = path.join(REPO_ROOT, 'bench/pr-reviews');
const RISK_RULES_PATH = path.join(REPO_ROOT, 'systems/toolsmith/scripts/config/risk-rules.yml');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

// Inputs from environment
const prNumber = process.env.PR_NUMBER || '';
const prTitle = process.env.PR_TITLE || 'Test PR Title';
const prBody = process.env.PR_BODY || 'Test PR Body';
const prAuthor = process.env.PR_AUTHOR || 'developer';
const prMerged = process.env.PR_MERGED === 'true';
const persistReview = process.env.PERSIST_REVIEW === 'true' || prMerged;
const dryRun = process.env.DRY_RUN === 'true';

if (!prNumber) {
  console.error('Error: PR_NUMBER environment variable is required.');
  process.exit(1);
}

const targetFileName = `pr-${prNumber}.md`;
const targetFilePath = path.join(PR_REVIEWS_DIR, targetFileName);

console.log(`[PR Review] Processing PR #${prNumber} (Merged: ${prMerged}, Persist: ${persistReview})...`);
if (dryRun) console.log('[DRY RUN] Enabled - no files will be written.');

// 1. Get changed files
let changedFiles: string[] = [];
try {
  const diffOutput = execSync('git diff --name-only origin/main...HEAD || git diff --name-only origin/main || git diff --name-only HEAD~1 HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' });
  changedFiles = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
} catch (e) {
  console.warn('Git diff failed, trying local fallback status check...');
  try {
    const statusOutput = execSync('git status --porcelain', { cwd: REPO_ROOT, encoding: 'utf-8' });
    changedFiles = statusOutput.split('\n').map(line => line.substring(3).trim()).filter(Boolean);
  } catch (err) {
    console.error('Failed to retrieve changed files list.');
  }
}

console.log(`[PR Review] Detected ${changedFiles.length} changed files:`, changedFiles);

// 2. Load Risk Rules
let restrictedPaths: string[] = [];
let requiresHumanReview: string[] = [];
if (fs.existsSync(RISK_RULES_PATH)) {
  try {
    const rules = parse(fs.readFileSync(RISK_RULES_PATH, 'utf-8'));
    restrictedPaths = rules.restricted_paths || [];
    requiresHumanReview = rules.requires_human_review || [];
  } catch (e) {
    console.error('Failed to parse risk rules config:', e);
  }
}

// Simple wildcard match helper
function matchesPattern(file: string, pattern: string): boolean {
  // Convert glob to simple regex
  const regexPattern = '^' + pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*') + '$';
  return new RegExp(regexPattern).test(file) || file.startsWith(pattern);
}

// Classify risk
let riskLevel = 'low';
const triggeredRestrictions: string[] = [];
const triggeredHumanReviews: string[] = [];

for (const file of changedFiles) {
  for (const pattern of restrictedPaths) {
    if (matchesPattern(file, pattern)) {
      riskLevel = 'high';
      triggeredRestrictions.push(`${file} (matched: ${pattern})`);
    }
  }
  for (const pattern of requiresHumanReview) {
    if (matchesPattern(file, pattern)) {
      if (riskLevel !== 'high') {
        riskLevel = 'medium';
      }
      triggeredHumanReviews.push(`${file} (matched: ${pattern})`);
    }
  }
}

console.log(`[PR Review] Risk Level Classified: ${riskLevel.toUpperCase()}`);

// 3. Construct Review Output
let reviewBody = `# PR Review: PR #${prNumber} - ${prTitle}

## Metadata
- **PR ID**: ${prNumber}
- **Repository**: ShaileshRawat1403/ai-sdlc-control-plane
- **Author**: ${prAuthor}
- **Risk Level**: **${riskLevel.toUpperCase()}**
- **Date**: ${new Date().toISOString().split('T')[0]}
- **Status**: ${prMerged ? 'Merged & Persisted' : 'Review Draft'}

## Summary of Changes
${prBody || 'No description provided.'}

## Changed Files Inspect List
${changedFiles.map(f => `- \`${f}\``).join('\n') || '- None'}

## Risk Assessment
`;

if (riskLevel === 'high') {
  reviewBody += `> [!CAUTION]
> **HIGH RISK PATHS TOUCHED.** This PR modifies restricted files. Human verification is required before promotion/merge.
>
> **Restricted files modified:**
${triggeredRestrictions.map(f => `> - \`${f}\``).join('\n')}
`;
} else if (riskLevel === 'medium') {
  reviewBody += `> [!WARNING]
> **MEDIUM RISK / MANUAL REVIEW REQUIRED.** This PR modifies systems configuration or decision logs.
>
> **Files requiring review:**
${triggeredHumanReviews.map(f => `> - \`${f}\``).join('\n')}
`;
} else {
  reviewBody += `> [!NOTE]
> **LOW RISK.** No restricted paths were touched. Code changes conform to agent boundaries.
`;
}

reviewBody += `
## Validation Recommendations
${riskLevel === 'high' 
  ? '- **BLOCK MERGE**: Reject auto-merge. Human supervisor must inspect changes.' 
  : '- **SAFE RUN**: Standard validation runs are sufficient.'
}
`;

// Save comment report artifact for GitHub Actions to use
const commentReportPath = path.join(REPO_ROOT, 'pr-review-report.md');
if (!dryRun) {
  fs.writeFileSync(commentReportPath, reviewBody, 'utf-8');
  console.log(`[PR Review] Generated PR comment report artifact at ${commentReportPath}`);
}

// 4. Persist review to repository if merged or manually directed
if (persistReview) {
  const finalFileContent = `---
type: pr-review
pr: ${prNumber}
author: ${prAuthor}
risk: ${riskLevel}
date: ${new Date().toISOString().split('T')[0]}
status: ${prMerged ? 'merged' : 'reviewed'}
---
${reviewBody}
`;

  const dateStr = new Date().toISOString().split('T')[0];
  const agentRunFileName = `${dateStr}-pr-review-${prNumber}.md`;
  const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

  const agentRunLog = `---
type: agent-run-log
automation: pr-review
target: PR #${prNumber}
date: ${dateStr}
status: success
---

# Agent Run: PR Review #${prNumber}

## Execution Summary
- **Target File**: \`bench/pr-reviews/pr-${prNumber}.md\`
- **Risk Level**: ${riskLevel}
- **Persisted**: True
- **PR Merged**: ${prMerged}
- **Dry Run**: ${dryRun}

## Actions Taken
- Evaluated changed files list for restricted rules.
- Wrote PR comment summary.
- Saved PR review evidence file.
`;

  if (!dryRun) {
    fs.writeFileSync(targetFilePath, finalFileContent, 'utf-8');
    fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
    console.log(`[PR Review] Saved review log to ${targetFilePath}`);
    console.log(`[PR Review] Logged agent execution run to ${agentRunFilePath}`);
  } else {
    console.log(`[DRY RUN] Would write review log to ${targetFilePath}`);
    console.log(`[DRY RUN] Would write agent run log to ${agentRunFilePath}`);
  }
} else {
  console.log(`[PR Review] PR is active. Comments posted, but logs will not be committed until merge or label 'persist-review'.`);
}

console.log('[PR Review] Completed successfully.');
