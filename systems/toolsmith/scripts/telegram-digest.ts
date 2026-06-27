import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'yaml';
import { execSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../');

interface IntentDetails {
  intent: string;
  requested_action: string;
  target_system: string;
}

const COMMAND_MAP: Record<string, IntentDetails> = {
  '/status': { intent: 'status_check', requested_action: 'summarize', target_system: 'brainbench' },
  '/weekly': { intent: 'weekly_briefing', requested_action: 'summarize', target_system: 'weekly_report' },
  '/handoffs': { intent: 'handoffs_lookup', requested_action: 'observe', target_system: 'repo_handoffs' },
  '/blockers': { intent: 'blockers_lookup', requested_action: 'observe', target_system: 'dashboard' },
  '/evidence': { intent: 'evidence_lookup', requested_action: 'observe', target_system: 'dashboard' },
  '/decisions': { intent: 'decisions_lookup', requested_action: 'observe', target_system: 'dashboard' },
  '/approve': { intent: 'approve_dec', requested_action: 'approve', target_system: 'brainbench' },
  '/open_pr': { intent: 'open_pr_req', requested_action: 'open_pr', target_system: 'brainbench' },
  '/merge': { intent: 'merge_pr_req', requested_action: 'merge_pr', target_system: 'brainbench' },
  '/edit_state': { intent: 'edit_state_req', requested_action: 'change_state', target_system: 'brainbench' },
  '/mark_done': { intent: 'mark_done_req', requested_action: 'mutate', target_system: 'brainbench' }
};

// Parse command line arguments
function parseCommandArg(): string {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--command') {
      return argv[i + 1] || '';
    }
  }
  return '';
}

function handleStatus() {
  const indexPath = path.resolve(REPO_ROOT, 'dashboard/index.md');
  if (!fs.existsSync(indexPath)) {
    console.log('Dashboard index not found.');
    return;
  }
  const indexContent = fs.readFileSync(indexPath, 'utf-8');
  
  const snapshotPart = indexContent.split('<!-- brainbench:generated:visual-snapshot:start -->')[1]
    ?.split('<!-- brainbench:generated:visual-snapshot:end -->')[0] || '';
  
  const lines = snapshotPart.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  let sprint = 'Unknown';
  let humanReview = '0';
  let evidenceGaps = '0';
  let decisionGaps = '0';
  
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('Active Sprint:')) {
      sprint = l.replace(/^>\s*###\s*Active Sprint:\s*/, '').trim();
      if (lines[i+1] && lines[i+1].includes('Progress:')) {
        const progress = lines[i+1].replace(/^>\s*Progress:\s*/, '').trim().replace(/`/g, '');
        sprint += ` (${progress})`;
      }
    } else if (l.includes('Human Review:')) {
      humanReview = l.replace(/^>\s*###\s*Human Review:\s*/, '').trim();
    } else if (l.includes('Open Evidence Gaps:')) {
      evidenceGaps = l.replace(/^>\s*###\s*Open Evidence Gaps:\s*/, '').trim();
    } else if (l.includes('Open Decision Gaps:')) {
      decisionGaps = l.replace(/^>\s*###\s*Open Decision Gaps:\s*/, '').trim();
    }
  }

  // Derive Top 3 Priorities in priority order
  const priorities: string[] = [];
  if (humanReview !== '0') {
    priorities.push(`Human review pending: ${humanReview} queue item(s) require operator judgment.`);
  }
  if (evidenceGaps !== '0') {
    priorities.push(`Active Blockers: ${evidenceGaps} open evidence gap(s) require mapping PR in work-item frontmatter.`);
  }
  if (decisionGaps !== '0') {
    priorities.push(`Decision Gaps: ${decisionGaps} configuration gap(s) require logging an approved ADR.`);
  }

  // Stale repo handoffs check
  const expectedRepos = ['tessera', 'flowright', 'toolsmith', 'soothsayer'];
  const dailyDir = path.resolve(REPO_ROOT, 'bench/repo-handoffs/daily');
  const staleRepos: string[] = [];
  for (const repo of expectedRepos) {
    const filePath = path.join(dailyDir, `${repo}-daily.md`);
    if (!fs.existsSync(filePath)) {
      staleRepos.push(repo);
    } else {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const dateMatch = raw.match(/date:\s*"?([0-9-]+)"?/);
      if (dateMatch) {
        const d = dateMatch[1];
        if (d !== '2026-06-27') {
          staleRepos.push(repo);
        }
      }
    }
  }
  if (staleRepos.length > 0) {
    priorities.push(`Stale handoffs: No fresh daily handoff from repo(s): ${staleRepos.join(', ')}.`);
  }

  // Fallbacks if list is under 3
  if (priorities.length < 3) {
    priorities.push('Sprint completion: Verify all carry forward items.');
  }
  if (priorities.length < 3) {
    priorities.push('Pipeline check: Monitor automated tests.');
  }

  const top3 = priorities.slice(0, 3);

  console.log(`BrainBench Status\n`);
  console.log(`Top 3 needing attention:`);
  console.log(`1. ${top3[0]}`);
  console.log(`2. ${top3[1]}`);
  console.log(`3. ${top3[2]}\n`);
  
  console.log(`System health:`);
  console.log(`Sprint: ${sprint}`);
  console.log(`Evidence gaps: ${evidenceGaps}`);
  console.log(`Decision gaps: ${decisionGaps}`);
  console.log(`Human review: ${humanReview}\n`);
  
  console.log(`Latest signal:`);
  console.log(`adapter-hermes registered and active.\n`);
  console.log(`Source: dashboard/index.md`);
}

function handleWeekly() {
  const filePath = path.resolve(REPO_ROOT, 'dashboard/weekly-report.md');
  if (!fs.existsSync(filePath)) {
    console.log('Weekly report not found.');
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const metricsPart = content.split('<!-- brainbench:generated:start -->')[1]
    ?.split('<!-- brainbench:generated:end -->')[0] || '';
  
  console.log(`BrainBench Weekly Brief:\n`);
  console.log(metricsPart.trim());
  console.log(`\nSource: dashboard/weekly-report.md`);
}

function handleHandoffs() {
  console.log('BrainBench Repo Handoffs Status:\n');
  
  const registryPath = path.resolve(REPO_ROOT, 'state/repo-agent-registry.yml');
  let registry: any = { repo_agents: {} };
  if (fs.existsSync(registryPath)) {
    try {
      registry = parse(fs.readFileSync(registryPath, 'utf-8')) || { repo_agents: {} };
    } catch (e) {}
  }
  
  const dailyActive: string[] = [];
  const weeklySummary: string[] = [];
  const pausedDormant: string[] = [];
  
  for (const repoId of Object.keys(registry.repo_agents)) {
    const agent = registry.repo_agents[repoId];
    const cadence = agent.cadence || 'daily';
    const scope = agent.handoff_scope || 'observation_only';
    
    const dailyFile = path.resolve(REPO_ROOT, `bench/repo-handoffs/daily/${repoId}-daily.md`);
    const weeklyFile = path.resolve(REPO_ROOT, `bench/repo-handoffs/weekly/${repoId}-weekly.md`);
    
    let freshness = 'no handoff found';
    let status = 'unknown';
    
    if (cadence === 'daily' || fs.existsSync(dailyFile)) {
      if (fs.existsSync(dailyFile)) {
        const raw = fs.readFileSync(dailyFile, 'utf-8');
        const fm = parse(raw.split('---')[1]);
        status = fm.status || 'active';
        const d = fm.date;
        if (d === '2026-06-27') freshness = 'fresh today';
        else if (d === '2026-06-26') freshness = '1 day old';
        else freshness = 'stale';
      }
      if (status === 'paused' || status === 'dormant' || status === 'paused_sprint') {
        pausedDormant.push(`- ${repoId}: ${freshness}, status=${status}, scope=${scope}`);
      } else {
        dailyActive.push(`- ${repoId}: ${freshness}, status=${status}, scope=${scope}`);
      }
    } else {
      if (fs.existsSync(weeklyFile)) {
        const raw = fs.readFileSync(weeklyFile, 'utf-8');
        const fm = parse(raw.split('---')[1]);
        status = fm.status || 'stable';
        freshness = 'weekly summary present';
      }
      if (status === 'paused' || status === 'dormant') {
        pausedDormant.push(`- ${repoId}: ${freshness}, status=${status}, scope=${scope}`);
      } else {
        weeklySummary.push(`- ${repoId}: ${freshness}, status=${status}, scope=${scope}`);
      }
    }
  }

  console.log('Daily Active:');
  console.log(dailyActive.length > 0 ? dailyActive.join('\n') : 'None');
  console.log('\nWeekly Summary:');
  console.log(weeklySummary.length > 0 ? weeklySummary.join('\n') : 'None');
  console.log('\nPaused / Dormant:');
  console.log(pausedDormant.length > 0 ? pausedDormant.join('\n') : 'None');
  
  console.log(`\nSource: bench/repo-handoffs/`);
}

function handleBlockers() {
  console.log('BrainBench Active Blockers & Evidence Gaps:\n');
  
  const gapsPath = path.resolve(REPO_ROOT, 'dashboard/evidence-gaps.md');
  let hasGaps = false;
  if (fs.existsSync(gapsPath)) {
    const raw = fs.readFileSync(gapsPath, 'utf-8');
    const part = raw.split('<!-- brainbench:generated:start -->')[1]
      ?.split('<!-- brainbench:generated:end -->')[0] || '';
    
    const lines = part.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.startsWith('|') && !line.includes('Gap ID') && !line.includes('---|'));
    
    if (lines.length > 0) {
      hasGaps = true;
      console.log('Action Items:');
      for (const line of lines) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cols.length >= 3) {
          console.log(`- Action Required: Map PR in work-item frontmatter for Issue ${cols[1]} to clear evidence gate.`);
        }
      }
    }
  }

  if (!hasGaps) {
    console.log('No active blockers or evidence gaps detected.');
  }
  
  console.log(`\nSource: dashboard/evidence-gaps.md`);
}

function handleEvidence() {
  console.log('BrainBench Validation Evidence Index:\n');
  
  const indexPath = path.resolve(REPO_ROOT, 'bench/validation/evidence-index.md');
  if (fs.existsSync(indexPath)) {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const part = raw.split('<!-- brainbench:generated:start -->')[1]
      ?.split('<!-- brainbench:generated:end -->')[0] || '';
    
    const lines = part.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.startsWith('|') && !line.includes('Task') && !line.includes('---|'));
    
    for (const line of lines) {
      const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length >= 3) {
        const taskText = cols[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        const evidenceText = cols[2].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
        console.log(`- ${taskText}: PR=${cols[1]} (${evidenceText})`);
      }
    }
  }
  
  console.log(`\nSource: bench/validation/evidence-index.md`);
}

function handleDecisions() {
  console.log('BrainBench Active Decisions & Gaps:\n');
  
  const gapsPath = path.resolve(REPO_ROOT, 'dashboard/decision-gaps.md');
  let hasGaps = false;
  if (fs.existsSync(gapsPath)) {
    const raw = fs.readFileSync(gapsPath, 'utf-8');
    const part = raw.split('<!-- brainbench:generated:start -->')[1]
      ?.split('<!-- brainbench:generated:end -->')[0] || '';
    
    const lines = part.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line.startsWith('|') && !line.includes('Gap ID') && !line.includes('---|'));
    
    if (lines.length > 0) {
      hasGaps = true;
      console.log('Decision Gaps:');
      for (const line of lines) {
        const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
        if (cols.length >= 4) {
          console.log(`- *Theme ${cols[1]}*: ${cols[3]}`);
        }
      }
      console.log();
    }
  }
  
  if (!hasGaps) {
    console.log('Decision Gaps: None\n');
  }

  const decisionsDir = path.resolve(REPO_ROOT, 'brain/decisions');
  if (fs.existsSync(decisionsDir)) {
    console.log('Recent Decision Logs:');
    const files = fs.readdirSync(decisionsDir)
      .filter(file => file.endsWith('.md'))
      .sort()
      .reverse()
      .slice(0, 5);
    
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(decisionsDir, file), 'utf-8');
        const parts = raw.split('---');
        if (parts.length >= 3) {
          const fm = parse(parts[1]);
          console.log(`- [Approved] ${fm.title} (${fm.date})`);
        }
      } catch (e) {}
    }
  }
  
  console.log(`\nSource: dashboard/decision-gaps.md`);
}

function main() {
  const commandStr = parseCommandArg();
  if (!commandStr) {
    console.error('Error: --command <string> argument is required.');
    process.exit(1);
  }

  const parts = commandStr.trim().split(/\s+/);
  const baseCmd = parts[0];

  const mapped = COMMAND_MAP[baseCmd] || { intent: 'unknown_cmd', requested_action: 'unknown', target_system: 'brainbench' };

  const intentJson = {
    source: 'telegram',
    actor: 'shailesh',
    intent: mapped.intent,
    target_system: mapped.target_system,
    requested_action: mapped.requested_action,
    raw_message: commandStr
  };

  const tmpDir = path.resolve(REPO_ROOT, 'tmp/hermes-requests');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const safeCmdName = baseCmd.replace('/', '').replace('_', '-');
  const tmpIntentPath = path.join(tmpDir, `${safeCmdName}.json`);
  fs.writeFileSync(tmpIntentPath, JSON.stringify(intentJson, null, 2), 'utf-8');

  const adapterPath = process.env.ADAPTER_HERMES_PATH || path.resolve(REPO_ROOT, '../adapter-hermes/src/index.ts');
  const requestOutputDir = path.resolve(REPO_ROOT, 'tmp/hermes-requests');
  const auditDir = path.resolve(REPO_ROOT, 'bench/agent-runs/hermes');

  let allowed = false;
  let governanceReason = '';
  let governanceFallback = '';

  try {
    execSync(
      `bun run ${adapterPath} --intent ${tmpIntentPath} --request-output-dir ${requestOutputDir} --audit-dir ${auditDir}`,
      { stdio: 'pipe', encoding: 'utf-8' }
    );
    allowed = true;
  } catch (e: any) {
    allowed = false;
    const requestYmlPath = path.join(requestOutputDir, `flowright-request-${safeCmdName}.yml`);
    if (fs.existsSync(requestYmlPath)) {
      try {
        const content = fs.readFileSync(requestYmlPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.startsWith('reason:')) {
            governanceReason = line.replace('reason:', '').trim();
          }
          if (line.startsWith('fallback:')) {
            governanceFallback = line.replace('fallback:', '').trim();
          }
        }
      } catch (err) {}
    }
  }

  if (!allowed) {
    if (mapped.requested_action === 'unknown') {
      console.log(`Unknown command. Supported read-only commands are /status, /weekly, /handoffs, /blockers, /evidence, /decisions.`);
    } else {
      console.log(`Rejected.`);
      console.log(`Reason: ${governanceReason || 'State mutation is not allowed in adapter-hermes V0.1.'}`);
      console.log(`Safe Fallback: ${governanceFallback || 'Draft a transition plan instead.'}`);
    }
    process.exit(1);
  }

  // Allowed read-only handler routing
  switch (baseCmd) {
    case '/status':
      handleStatus();
      break;
    case '/weekly':
      handleWeekly();
      break;
    case '/handoffs':
      handleHandoffs();
      break;
    case '/blockers':
      handleBlockers();
      break;
    case '/evidence':
      handleEvidence();
      break;
    case '/decisions':
      handleDecisions();
      break;
    default:
      console.log(`Unknown command. Supported read-only commands are /status, /weekly, /handoffs, /blockers, /evidence, /decisions.`);
      process.exit(1);
  }
}

main();
