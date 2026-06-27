import { describe, test, expect } from 'bun:test';
import { executeDigest, clampMessage, shouldFireDaily, shouldFireWeekly } from './telegram-bot';

describe('Telegram Bot Integration Helper Tests', () => {
  test('executeDigest allowed status command', () => {
    const res = executeDigest('/status');
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('BrainBench Status');
  });

  test('executeDigest rejects mutation mark_done command', () => {
    const res = executeDigest('/mark_done issue-12');
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('Rejected.');
    expect(res.stdout).toContain('State mutation is not allowed');
  });

  test('clampMessage behavior for normal length', () => {
    const msg = 'Compact text status report';
    expect(clampMessage(msg)).toBe(msg);
  });

  test('clampMessage behavior for very long length', () => {
    const longMsg = 'a'.repeat(4500);
    const clamped = clampMessage(longMsg);
    expect(clamped.length).toBeLessThan(4500);
    expect(clamped).toContain('... (message truncated)');
    expect(clamped).toContain('Open dashboard/index.md for full details.');
  });
});

describe('Telegram Bot Scheduler Logic Tests (Asia/Kolkata)', () => {
  test('18:00 IST daily fires once', () => {
    const fires = shouldFireDaily(18, 0, '2026-06-27', '');
    expect(fires).toBe(true);
  });

  test('18:01 IST daily does not fire', () => {
    const fires = shouldFireDaily(18, 1, '2026-06-27', '');
    expect(fires).toBe(false);
  });

  test('Sunday 18:00 IST weekly fires', () => {
    const fires = shouldFireWeekly(18, 0, 'Sunday', '2026-06-28', '');
    expect(fires).toBe(true);
  });

  test('Monday 18:00 IST weekly does not fire', () => {
    const fires = shouldFireWeekly(18, 0, 'Monday', '2026-06-29', '');
    expect(fires).toBe(false);
  });

  test('already-sent daily does not resend', () => {
    const fires = shouldFireDaily(18, 0, '2026-06-27', '2026-06-27');
    expect(fires).toBe(false);
  });

  test('already-sent weekly does not resend', () => {
    const fires = shouldFireWeekly(18, 0, 'Sunday', '2026-06-28', '2026-06-28');
    expect(fires).toBe(false);
  });
});
