const cron = require('node-cron');
const db = require('./database');
const { runTaskSet } = require('./taskExecutor');

let bot = null;

function initScheduler(telegramBot) {
  bot = telegramBot;

  // Check for due tasks every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    console.log('🔄 Checking for scheduled tasks...');
    try {
      const dueTasks = await db.getActiveDueTaskSets();

      for (const taskSet of dueTasks) {
        console.log(`▶️ Running scheduled task set: ${taskSet.name}`);

        if (bot) {
          await bot.telegram.sendMessage(
            taskSet.user_id,
            `🤖 Running scheduled tasks: *${taskSet.name}*\nSit back and relax while I work!`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }

        const results = await runTaskSet(taskSet, bot);
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        if (bot) {
          await bot.telegram.sendMessage(
            taskSet.user_id,
            `✅ *${taskSet.name}* completed!\n\n` +
            `📊 Results:\n` +
            `• ✅ Success: ${successCount}\n` +
            `• ❌ Failed: ${failCount}\n\n` +
            `Next run: ${taskSet.repeat_schedule === 'daily' ? 'Tomorrow' : taskSet.repeat_schedule}`,
            { parse_mode: 'Markdown' }
          ).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  });

  console.log('⏰ Scheduler initialized — checking every 15 minutes');
}

module.exports = { initScheduler };
