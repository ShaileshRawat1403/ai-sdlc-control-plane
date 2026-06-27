import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const DIGEST_SCRIPT = path.join(REPO_ROOT, 'systems/toolsmith/scripts/telegram-digest.ts');

function executeDigest(command: string): { code: number; stdout: string; stderr: string } {
  // Use safe spawning with argument arrays to prevent injection
  const result = spawnSync('bun', ['run', DIGEST_SCRIPT, '--command', command], {
    encoding: 'utf-8'
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function clampMessage(text: string): string {
  const maxLength = 4000;
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + '\n\n... (message truncated)\nOpen dashboard/index.md for full details.';
  }
  return text;
}

function getKolkataTime(simulatedDate?: Date): { hour: number; minute: number; weekdayStr: string; dateString: string } {
  const targetDate = simulatedDate || new Date();
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(targetDate);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }
  
  const hour = parseInt(partMap.hour, 10);
  const minute = parseInt(partMap.minute, 10);
  
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  const weekdayStr = weekdayFormatter.format(targetDate);
  
  const dateString = `${partMap.year}-${partMap.month}-${partMap.day}`;
  
  return { hour, minute, weekdayStr, dateString };
}

function shouldFireDaily(hour: number, minute: number, dateString: string, lastSentDailyDate: string): boolean {
  return hour === 18 && minute === 0 && dateString !== lastSentDailyDate;
}

function shouldFireWeekly(hour: number, minute: number, weekdayStr: string, dateString: string, lastSentWeeklyDate: string): boolean {
  return hour === 18 && minute === 0 && weekdayStr === 'Sunday' && dateString !== lastSentWeeklyDate;
}

function startScheduler(botToken: string, allowedChatId: number) {
  let lastDailySentDate = '';
  let lastWeeklySentDate = '';
  
  console.log('[Telegram Bot] Starting background scheduler check (Asia/Kolkata, dedupe: process-local)...');
  
  setInterval(async () => {
    try {
      const nowKolkata = getKolkataTime();
      if (shouldFireDaily(nowKolkata.hour, nowKolkata.minute, nowKolkata.dateString, lastDailySentDate)) {
        lastDailySentDate = nowKolkata.dateString;
        console.log(`[Scheduler] Firing scheduled daily status digest...`);
        const digestRes = executeDigest('/status');
        const responseText = digestRes.stdout || digestRes.stderr || 'No response output generated.';
        const clamped = clampMessage(responseText);
        
        const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
        await fetch(`${baseUrl}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: allowedChatId,
            text: clamped
          })
        });
      }
      
      if (shouldFireWeekly(nowKolkata.hour, nowKolkata.minute, nowKolkata.weekdayStr, nowKolkata.dateString, lastWeeklySentDate)) {
        lastWeeklySentDate = nowKolkata.dateString;
        console.log(`[Scheduler] Firing scheduled weekly status digest...`);
        const digestRes = executeDigest('/weekly');
        const responseText = digestRes.stdout || digestRes.stderr || 'No response output generated.';
        const clamped = clampMessage(responseText);
        
        const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
        await fetch(`${baseUrl}/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: allowedChatId,
            text: clamped
          })
        });
      }
    } catch (e) {
      console.error('[Scheduler] Exception in background scheduler tick:', e);
    }
  }, 10000); // Check every 10 seconds
}

async function runBot() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const allowedChatIdStr = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  
  if (!botToken || botToken === 'your_telegram_bot_token_here') {
    console.error('Error: TELEGRAM_BOT_TOKEN is not configured in environment.');
    process.exit(1);
  }
  if (!allowedChatIdStr || allowedChatIdStr === 'your_telegram_chat_id_here') {
    console.error('Error: TELEGRAM_ALLOWED_CHAT_ID is not configured in environment.');
    process.exit(1);
  }

  const allowedChatId = parseInt(allowedChatIdStr, 10);

  // Webhook state cleanup on startup
  console.log('[Telegram Bot] Starting up. Cleaning up webhook state...');
  try {
    const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
    const cleanWebhook = await fetch(`${baseUrl}/bot${botToken}/deleteWebhook?drop_pending_updates=false`);
    const cleanRes = await cleanWebhook.json();
    console.log('[Telegram Bot] deleteWebhook result:', cleanRes.ok ? 'success' : 'failed');
  } catch (e) {
    console.error('[Telegram Bot] Failed to call deleteWebhook during startup.');
  }

  // Start background schedule triggers
  startScheduler(botToken, allowedChatId);

  console.log('[Telegram Bot] Starting getUpdates long polling loop...');

  let offset = 0;
  
  while (true) {
    try {
      const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
      const url = `${baseUrl}/bot${botToken}/getUpdates?offset=${offset}&timeout=30`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (!data.ok) {
        console.error('[Telegram Bot] getUpdates error response from API.');
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      
      const updates = data.result || [];
      for (const update of updates) {
        // Advance offset to prevent duplicate processing
        offset = update.update_id + 1;
        
        const message = update.message;
        if (!message || !message.text) continue;
        
        const chatId = message.chat.id;
        const text = message.text.trim();
        
        // Chat whitelisting security check
        if (chatId !== allowedChatId) {
          console.warn(`[Telegram Bot] Ignored message from unauthorized chat ID: ${chatId}`);
          const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
          try {
            await fetch(`${baseUrl}/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: 'Access Denied.'
              })
            });
          } catch (err) {}
          continue;
        }

        // Process message text
        if (text.startsWith('/')) {
          const parts = text.split(/\s+/);
          const command = parts[0];
          
          const allowedCommands = ['/status', '/weekly', '/handoffs', '/blockers', '/evidence', '/decisions'];
          const rejectedCommands = ['/mark_done', '/approve', '/open_pr', '/merge', '/edit_state'];
          
          let responseText = '';
          if (allowedCommands.includes(command) || rejectedCommands.includes(command)) {
            // Spawn digest command safely
            const digestRes = executeDigest(text);
            responseText = digestRes.stdout || digestRes.stderr || 'No response output generated.';
          } else {
            // Help/Unknown command handling
            responseText = 'Supported read-only commands: /status, /weekly, /handoffs, /blockers, /evidence, /decisions.';
          }

          // Reply via sendMessage
          const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
          try {
            const clamped = clampMessage(responseText);
            await fetch(`${baseUrl}/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: allowedChatId,
                text: clamped
              })
            });
          } catch (sendErr) {
            console.error('[Telegram Bot] Failed to send message reply.');
          }
        }
      }
    } catch (e) {
      console.error('[Telegram Bot] Exception in long polling loop.');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const sendDaily = argv.includes('--send-daily');
  const sendWeekly = argv.includes('--send-weekly');

  if (sendDaily || sendWeekly) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const allowedChatIdStr = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    
    if (!botToken || !allowedChatIdStr) {
      console.error('Error: TELEGRAM_BOT_TOKEN or TELEGRAM_ALLOWED_CHAT_ID not configured.');
      process.exit(1);
    }
    
    const allowedChatId = parseInt(allowedChatIdStr, 10);
    const command = sendDaily ? '/status' : '/weekly';
    console.log(`[Telegram Bot] Sending single update for ${command}...`);
    
    const digestRes = executeDigest(command);
    const responseText = digestRes.stdout || digestRes.stderr || 'No response output generated.';
    const clamped = clampMessage(responseText);
    
    const baseUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
    try {
      const pushRes = await fetch(`${baseUrl}/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: allowedChatId,
          text: clamped
        })
      });
      const pushData = await pushRes.json();
      console.log('[Telegram Bot] Push result:', pushData.ok ? 'success' : 'failed');
      process.exit(pushData.ok ? 0 : 1);
    } catch (e) {
      console.error('[Telegram Bot] Failed to execute push send.');
      process.exit(1);
    }
  } else {
    // Run updates long polling loop
    await runBot();
  }
}

export { runBot, executeDigest, clampMessage, main, getKolkataTime, shouldFireDaily, shouldFireWeekly };

if (import.meta.main) {
  main();
}
