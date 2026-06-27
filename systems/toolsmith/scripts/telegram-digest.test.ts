import { describe, test, expect } from 'bun:test';
import { execSync } from 'child_process';
import * as path from 'path';

const SCRIPT_PATH = path.resolve(__dirname, 'telegram-digest.ts');

function runCommand(cmd: string): { code: number; stdout: string } {
  try {
    const stdout = execSync(`bun run ${SCRIPT_PATH} --command "${cmd}"`, {
      encoding: 'utf-8',
      stdio: 'pipe'
    });
    return { code: 0, stdout };
  } catch (e: any) {
    return { code: e.status || 1, stdout: e.stdout || '' };
  }
}

describe('Telegram Digest Adapter Integration Tests', () => {
  test('/status is allowed', () => {
    const res = runCommand('/status');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('BrainBench Status');
    expect(res.stdout).toContain('Sprint:');
    expect(res.stdout).toContain('Human review:');
    expect(res.stdout).toContain('Top 3 needing attention:');
    expect(res.stdout).toContain('Source: dashboard/index.md');
  });
 
  test('/weekly is allowed', () => {
    const res = runCommand('/weekly');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('BrainBench Weekly Brief:');
    expect(res.stdout).toContain('Active Systems Count');
    expect(res.stdout).toContain('Source: dashboard/weekly-report.md');
  });
 
  test('/handoffs is allowed', () => {
    const res = runCommand('/handoffs');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('BrainBench Repo Handoffs Status:');
    expect(res.stdout).toContain('Daily Active:');
    expect(res.stdout).toContain('Weekly Summary:');
    expect(res.stdout).toContain('Paused / Dormant:');
    expect(res.stdout).toContain('Source: bench/repo-handoffs/');
  });
 
  test('/blockers is allowed', () => {
    const res = runCommand('/blockers');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Active Blockers');
    expect(res.stdout).toContain('Action Required:');
    expect(res.stdout).toContain('Source: dashboard/evidence-gaps.md');
  });
 
  test('/evidence is allowed', () => {
    const res = runCommand('/evidence');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Validation Evidence Index:');
    expect(res.stdout).toContain('Source: bench/validation/evidence-index.md');
  });
 
  test('/decisions is allowed', () => {
    const res = runCommand('/decisions');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Active Decisions & Gaps:');
    expect(res.stdout).toContain('Source: dashboard/decision-gaps.md');
  });

  test('/mark_done is rejected', () => {
    const res = runCommand('/mark_done issue-12');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Rejected.');
    expect(res.stdout).toContain('State mutation is not allowed');
  });

  test('/approve is rejected', () => {
    const res = runCommand('/approve decision');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Rejected.');
  });

  test('/open_pr is rejected', () => {
    const res = runCommand('/open_pr');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Rejected.');
  });

  test('/merge is rejected', () => {
    const res = runCommand('/merge');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Rejected.');
  });

  test('/edit_state is rejected', () => {
    const res = runCommand('/edit_state');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Rejected.');
  });

  test('unknown command is rejected safely', () => {
    const res = runCommand('/hack_db');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Unknown command. Supported read-only commands are');
  });
});
