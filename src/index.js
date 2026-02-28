require('dotenv').config();
const { Telegraf } = require('telegraf');
const { handleStart, handleHelp, handleMessage } = require('./handlers/messageHandler');
const { initScheduler } = require('./services/scheduler');

// Validate required environment variables
const required = ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ENCRYPTION_KEY'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your values');
  process.exit(1);
}

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// ─── Commands ────────────────────────────────────────────
bot.start(handleStart);
bot.help(handleHelp);
bot.command('wallets', (ctx) => {
  ctx.message.text = 'show my wallets';
  return handleMessage(ctx);
});
bot.command('chains', (ctx) => {
  ctx.message.text = 'show my chains';
  return handleMessage(ctx);
});
bot.command('tasks', (ctx) => {
  ctx.message.text = 'show my tasks';
  return handleMessage(ctx);
});
bot.command('gas', (ctx) => {
  ctx.message.text = 'check gas prices';
  return handleMessage(ctx);
});
bot.command('history', (ctx) => {
  ctx.message.text = 'show task history';
  return handleMessage(ctx);
});
bot.command('story', (ctx) => {
  ctx.message.text = 'tell me a story';
  return handleMessage(ctx);
});

// ─── Main message handler ────────────────────────────────
bot.on('text', handleMessage);

// ─── Error handler ───────────────────────────────────────
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An unexpected error occurred. Please try again.').catch(() => {});
});

// ─── Launch ──────────────────────────────────────────────
async function launch() {
  console.log('🚀 Starting BlockBot AI...');

  // Init scheduler for automated tasks
  initScheduler(bot);

  // Start bot
  await bot.launch();
  console.log('✅ BlockBot AI is running!');
  console.log('📱 Go to Telegram and start chatting with your bot');
}

launch().catch(err => {
  console.error('Launch failed:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
