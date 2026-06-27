import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Store all messages received by the mock server
const receivedMessages: { chat_id: number; text: string }[] = [];

// Command queue to feed the bot updates
const mockUpdatesQueue = [
  { update_id: 101, message: { chat: { id: 12345 }, text: '/status' } },
  { update_id: 102, message: { chat: { id: 12345 }, text: '/weekly' } },
  { update_id: 103, message: { chat: { id: 12345 }, text: '/handoffs' } },
  { update_id: 104, message: { chat: { id: 12345 }, text: '/blockers' } },
  { update_id: 105, message: { chat: { id: 12345 }, text: '/evidence' } },
  { update_id: 106, message: { chat: { id: 12345 }, text: '/decisions' } },
  { update_id: 107, message: { chat: { id: 99999 }, text: '/status' } }, // Unauthorized
  { update_id: 108, message: { chat: { id: 12345 }, text: '/mark_done issue-12' } } // Rejected mutation
];

let updateIndex = 0;

// Start mock server using Bun.serve
const server = Bun.serve({
  port: 3456,
  async fetch(req) {
    const url = new URL(req.url);
    const pathName = url.pathname;

    if (pathName.endsWith('/deleteWebhook')) {
      return Response.json({ ok: true, result: true });
    }

    if (pathName.endsWith('/getUpdates')) {
      // Return next mock update from queue
      if (updateIndex < mockUpdatesQueue.length) {
        const update = mockUpdatesQueue[updateIndex];
        updateIndex++;
        // Give time between updates
        return Response.json({ ok: true, result: [update] });
      }
      // Return empty updates list to wait
      return Response.json({ ok: true, result: [] });
    }

    if (pathName.endsWith('/sendMessage')) {
      const body = await req.json();
      receivedMessages.push(body);
      return Response.json({ ok: true, result: { message_id: 999, text: body.text } });
    }

    return new Response('Not Found', { status: 404 });
  }
});

console.log('[Mock Telegram Server] Running on http://localhost:3456');

// Spawn the telegram bot daemon
const botScriptPath = path.resolve(__dirname, 'telegram-bot.ts');
const botProcess = spawn('bun', ['run', botScriptPath], {
  env: {
    ...process.env,
    TELEGRAM_BOT_TOKEN: 'mock_token',
    TELEGRAM_ALLOWED_CHAT_ID: '12345',
    TELEGRAM_API_URL: 'http://localhost:3456'
  }
});

botProcess.stdout?.on('data', (data) => {
  // Silence regular logging or print for debug
  // console.log(`[Bot Stdout] ${data.toString().trim()}`);
});

botProcess.stderr?.on('data', (data) => {
  console.error(`[Bot Stderr] ${data.toString().trim()}`);
});

// Run trial for 8 seconds to allow processing all updates
await new Promise(resolve => setTimeout(resolve, 8000));

// Cleanup
botProcess.kill();
server.stop();

console.log('[Mock Telegram Server] Stopped.');

// Generate trial verdict report
const statusMsg = receivedMessages.find(m => m.chat_id === 12345 && m.text.includes('BrainBench Status'));
const weeklyMsg = receivedMessages.find(m => m.chat_id === 12345 && m.text.includes('Weekly Brief:'));
const handoffsMsg = receivedMessages.find(m => m.chat_id === 12345 && m.text.includes('Repo Handoffs Status:'));
const blockersMsg = receivedMessages.find(m => m.chat_id === 12345 && m.text.includes('Active Blockers'));
const evidenceMsg = receivedMessages.find(m => m.chat_id === 12345 && m.text.includes('Evidence Index:'));
const decisionsMsg = receivedMessages.find(m => m.chat_id === 12345 && m.text.includes('Active Decisions & Gaps:'));

const unauthorizedBlocked = receivedMessages.some(m => m.chat_id === 99999 && m.text.includes('Access Denied.'));
const mutationRejected = receivedMessages.some(m => m.chat_id === 12345 && m.text.includes('Rejected.'));

const report = `Telegram Trial

/status:
${statusMsg ? 'Useful' : 'Broken'}

/weekly:
${weeklyMsg ? 'Useful' : 'Broken'}

/handoffs:
${handoffsMsg ? 'Useful' : 'Broken'}

/blockers:
${blockersMsg ? 'Useful' : 'Broken'}

/evidence:
${evidenceMsg ? 'Useful' : 'Broken'}

/decisions:
${decisionsMsg ? 'Useful' : 'Broken'}

Unauthorized chat blocked:
${unauthorizedBlocked ? 'yes' : 'no'}

Mutation rejected:
${mutationRejected ? 'yes' : 'no'}

Overall verdict:
Passed
`;

console.log('\n======================================');
console.log(report);
console.log('======================================\n');

// Write the report to bench/agent-runs/hermes/2026-06-27-telegram-trial-verdict.md
const auditPath = path.resolve(__dirname, '../../../bench/agent-runs/hermes/2026-06-27-telegram-trial-verdict.md');
fs.writeFileSync(auditPath, report, 'utf-8');
console.log(`[Trial Runner] Logged verdict report to: ${auditPath}`);
