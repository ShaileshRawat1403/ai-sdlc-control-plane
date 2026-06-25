import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from 'yaml';

// Configuration
const REPO_ROOT = path.resolve(__dirname, '../../../');
const WORK_ITEMS_DIR = path.join(REPO_ROOT, 'bench/work-items');
const ACTIVE_SPRINT_PATH = path.join(REPO_ROOT, 'state/active-sprint.yml');
const WORK_ITEM_TEMPLATE_PATH = path.join(REPO_ROOT, 'control/templates/work-item.md');
const AGENT_RUNS_DIR = path.join(REPO_ROOT, 'bench/agent-runs');

// Inputs from environment
const issueNumber = process.env.ISSUE_NUMBER || '';
const issueTitle = process.env.ISSUE_TITLE || 'Test Issue Title';
const issueBody = process.env.ISSUE_BODY || 'Test Issue Body';
const issueLabels = process.env.ISSUE_LABELS || '';
const dryRun = process.env.DRY_RUN === 'true';

if (!issueNumber) {
  console.error('Error: ISSUE_NUMBER environment variable is required.');
  process.exit(1);
}

const targetFileName = `issue-${issueNumber}.md`;
const targetFilePath = path.join(WORK_ITEMS_DIR, targetFileName);

console.log(`[Issue Intake] Processing GitHub Issue #${issueNumber}...`);
if (dryRun) console.log('[DRY RUN] Enabled - no files will be written.');

// Helper to split frontmatter and body
function parseMarkdownFile(filePath: string): { frontmatter: any, body: string, humanNotes: string } {
  if (!fs.existsSync(filePath)) {
    return { frontmatter: {}, body: '', humanNotes: '' };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const parts = content.split('---');
  let frontmatter = {};
  let body = content;
  
  if (parts.length >= 3) {
    try {
      frontmatter = parse(parts[1]);
      body = parts.slice(2).join('---').trim();
    } catch (e) {
      console.warn('Failed to parse YAML frontmatter, treating file as raw text.');
    }
  }

  // Extract human notes section
  let humanNotes = '';
  const humanNotesMarker = '## Human Notes';
  const markerIndex = body.indexOf(humanNotesMarker);
  if (markerIndex !== -1) {
    humanNotes = body.slice(markerIndex + humanNotesMarker.length).trim();
  }

  return { frontmatter, body, humanNotes };
}

// 1. Read existing file if present, to preserve manual fields
const existing = parseMarkdownFile(targetFilePath);
const originalNotes = existing.humanNotes;

// Determine system classification based on labels or title content
let system = 'unset';
const systems = ['dax', 'rook', 'soothsayer', 'picobot', 'pruningmypothos', 'flowright', 'toolsmith', 'tessera', 'brainbench'];
for (const sys of systems) {
  if (issueLabels.toLowerCase().includes(sys) || issueTitle.toLowerCase().includes(sys)) {
    system = sys;
    break;
  }
}

// Merge frontmatter
const newFrontmatter = {
  type: 'work-item',
  source: 'github-issue',
  issue: parseInt(issueNumber, 10),
  status: existing.frontmatter.status || 'intake',
  system: existing.frontmatter.system || system,
  priority: existing.frontmatter.priority || 'unset',
  owner: existing.frontmatter.owner || 'unset',
  created: existing.frontmatter.created || new Date().toISOString().split('T')[0],
  last_updated: new Date().toISOString().split('T')[0]
};

// 2. Generate new Markdown content
const templateContent = fs.existsSync(WORK_ITEM_TEMPLATE_PATH) 
  ? fs.readFileSync(WORK_ITEM_TEMPLATE_PATH, 'utf-8')
  : '';

// Construct Markdown
const markdownBody = `
# Work Item: ${issueTitle}

## Source
- GitHub Issue: #${issueNumber}

## Summary
${issueBody}

## Classification
- Labels: ${issueLabels || 'none'}
- Detected System: ${newFrontmatter.system}

## Acceptance Criteria
- [ ] Implement requested change
- [ ] Verify validation evidence passes
- [ ] No regression introduced

## Evidence Needed
- Validation evidence logged in \`bench/validation/\`

## Human Notes
${originalNotes || '[Add manual notes, priorities, or instructions here. These will be preserved by automation.]'}
`;

const finalFileContent = `---
${stringify(newFrontmatter).trim()}
---
${markdownBody.trim()}
`;

// 3. Update active sprint backlog idempotently
let sprintUpdated = false;
let activeSprintContent = '';
if (fs.existsSync(ACTIVE_SPRINT_PATH)) {
  const sprintData = parse(fs.readFileSync(ACTIVE_SPRINT_PATH, 'utf-8'));
  if (sprintData && sprintData.sprint) {
    const backlog = sprintData.sprint.sprint_backlog || [];
    const taskName = `issue-${issueNumber}`;
    const existingTask = backlog.find((t: any) => t.task === taskName);
    
    if (!existingTask) {
      backlog.push({
        task: taskName,
        status: newFrontmatter.status
      });
      sprintData.sprint.sprint_backlog = backlog;
      activeSprintContent = stringify(sprintData);
      sprintUpdated = true;
      console.log(`[Issue Intake] Appended task ${taskName} to active sprint backlog.`);
    } else {
      console.log(`[Issue Intake] Task ${taskName} already exists in sprint backlog. Preserving existing status: ${existingTask.status}.`);
    }
  }
}

// 4. Save execution log
const dateStr = new Date().toISOString().split('T')[0];
const agentRunFileName = `${dateStr}-issue-intake-${issueNumber}.md`;
const agentRunFilePath = path.join(AGENT_RUNS_DIR, agentRunFileName);

const agentRunLog = `---
type: agent-run-log
automation: issue-intake
target: #${issueNumber}
date: ${dateStr}
status: success
---

# Agent Run: Issue Intake #${issueNumber}

## Execution Summary
- **Target File**: \`bench/work-items/issue-${issueNumber}.md\`
- **System**: ${newFrontmatter.system}
- **Sprint Updated**: ${sprintUpdated}
- **Dry Run**: ${dryRun}

## Actions Taken
- Created or updated work item for Issue #${issueNumber}.
- Preserved existing manual notes: ${!!originalNotes}
- Ensured idempotency of active-sprint integration.
`;

// Write updates if not dry run
if (!dryRun) {
  fs.writeFileSync(targetFilePath, finalFileContent, 'utf-8');
  console.log(`[Issue Intake] Saved work item to ${targetFilePath}`);
  
  if (sprintUpdated && activeSprintContent) {
    fs.writeFileSync(ACTIVE_SPRINT_PATH, activeSprintContent, 'utf-8');
    console.log(`[Issue Intake] Saved active sprint changes to ${ACTIVE_SPRINT_PATH}`);
  }
  
  fs.writeFileSync(agentRunFilePath, agentRunLog, 'utf-8');
  console.log(`[Issue Intake] Logged agent execution run to ${agentRunFilePath}`);
} else {
  console.log(`[DRY RUN] Would write to ${targetFilePath}:\n${finalFileContent}`);
  if (sprintUpdated) {
    console.log(`[DRY RUN] Would update ${ACTIVE_SPRINT_PATH} with backlog task.`);
  }
  console.log(`[DRY RUN] Would write agent run log to ${agentRunFilePath}`);
}

console.log('[Issue Intake] Completed successfully.');
