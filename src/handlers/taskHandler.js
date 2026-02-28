const db = require('../services/database');
const { extractTaskFromAnnouncement, generateStory } = require('../services/ai');
const { runTaskSet, getNextRun } = require('../services/taskExecutor');
const { getEVMGasPrice } = require('../services/wallet');

async function sendLong(ctx, text, options) {
  const opts = options || {};
  const chunks = text.match(/.{1,4000}/gs) || [text];
  for (const chunk of chunks) await ctx.reply(chunk, opts);
}

// ─── Add Custom Chain ────────────────────────────────────
async function handleAddChain(ctx, text, userId) {
  const rpcMatch = text.match(/RPC\s*(?:URL)?\s*:?\s*(https?:\/\/[^\s\n]+)/i);
  const nameMatch = text.match(/(?:Network\s*)?Name\s*(?:[^:]*)?:\s*([^\n]+)/i);
  const chainIdMatch = text.match(/Chain\s*ID\s*:?\s*(\d+)/i);
  const symbolMatch = text.match(/(?:Currency\s*Symbol|Symbol)\s*:?\s*([A-Za-z]{2,10})/i);
  const explorerMatch = text.match(/(?:Block\s*)?Explorer\s*:?\s*(https?:\/\/[^\s\n]+)/i);

  if (!rpcMatch) {
    return ctx.reply(
      'To add a chain, paste its RPC details:\n\n' +
      'Network Name: MyChain Testnet\n' +
      'Chain ID: 12345\n' +
      'RPC URL: https://rpc.example.com\n' +
      'Currency Symbol: ETH\n' +
      'Block Explorer: https://explorer.example.com'
    );
  }

  const chainData = {
    name: (nameMatch && nameMatch[1].trim()) || 'Custom Chain',
    chain_id: (chainIdMatch && chainIdMatch[1]) || null,
    rpc_url: rpcMatch[1],
    currency_symbol: (symbolMatch && symbolMatch[1]) || 'ETH',
    decimals: 18,
    explorer_url: (explorerMatch && explorerMatch[1]) || null,
    is_testnet: text.toLowerCase().includes('testnet')
  };

  await db.saveCustomChain(userId, chainData);
  await ctx.reply(
    'Chain Added!\n\n' +
    'Name: ' + chainData.name + '\n' +
    'Chain ID: ' + (chainData.chain_id || 'N/A') + '\n' +
    'RPC: ' + chainData.rpc_url + '\n' +
    'Symbol: ' + chainData.currency_symbol
  );
}

// ─── View Chains ─────────────────────────────────────────
async function handleViewChains(ctx, userId) {
  const custom = await db.getUserChains(userId);
  const dexes = await db.getUserDexes(userId);

  let response = 'Built-in Chains: Ethereum, BSC, Polygon, Arbitrum, Base, Optimism, Sepolia, BSC Testnet, Solana, Aptos\n\n';

  if (custom.length) {
    response += 'Your Custom Chains (' + custom.length + '):\n';
    custom.forEach(function(c) {
      response += '- ' + c.name + ' | ID: ' + (c.chain_id || '?') + ' | ' + (c.is_testnet ? 'Testnet' : 'Mainnet') + '\n  RPC: ' + c.rpc_url + '\n\n';
    });
  }

  if (dexes.length) {
    response += 'Your Custom DEXes (' + dexes.length + '):\n';
    dexes.forEach(function(d) {
      response += '- ' + d.name + ' | Chain ' + d.chain_id + ' | Router: ' + d.router_address.slice(0, 16) + '...\n';
    });
  }

  if (!custom.length && !dexes.length) {
    response += 'No custom chains or DEXes saved yet.';
  }

  await sendLong(ctx, response);
}

// ─── Task Extraction ─────────────────────────────────────
async function handleTaskExtraction(ctx, text, userId, getHistory, addToHistory) {
  await ctx.reply('Analyzing announcement...');

  const extracted = await extractTaskFromAnnouncement(text);
  if (!extracted || extracted.type !== 'task_extraction') {
    return ctx.reply('Could not extract tasks from that. Try sending a clearer announcement with RPC details and task steps.');
  }

  const taskList = extracted.tasks
    ? extracted.tasks.map(function(t, i) { return (i + 1) + '. ' + t; }).join('\n')
    : 'No tasks found';

  addToHistory(userId, 'assistant', 'EXTRACTED_TASK:' + JSON.stringify(extracted));

  await ctx.reply(
    'Extracted!\n\n' +
    'Project: ' + (extracted.projectName || 'Unknown') + '\n' +
    'Network: ' + (extracted.network && extracted.network.name || 'Unknown') + '\n' +
    'RPC: ' + (extracted.network && extracted.network.rpcUrl || 'Not found') + '\n' +
    'Symbol: ' + (extracted.network && extracted.network.symbol || 'N/A') + '\n\n' +
    'Tasks:\n' + taskList + '\n\n' +
    'What next?\n' +
    '- "Save as [name]" to save for later\n' +
    '- "Save as [name] and run daily" to automate\n' +
    '- "Run now" to execute immediately'
  );
}

// ─── Save Task ───────────────────────────────────────────
async function handleSaveTask(ctx, text, userId, getHistory) {
  const history = getHistory(userId);
  const lastExtracted = history.slice().reverse().find(function(h) {
    return h.role === 'assistant' && h.content && h.content.startsWith('EXTRACTED_TASK:');
  });

  if (!lastExtracted) return ctx.reply('Please paste a testnet announcement first, then say "Save as [name]"!');

  const extracted = JSON.parse(lastExtracted.content.replace('EXTRACTED_TASK:', ''));
  const nameMatch = text.match(/save\s+(?:as\s+)?["']?([^"'\n]+?)["']?\s*(?:and|$)/i);
  const name = (nameMatch && nameMatch[1].trim()) || extracted.projectName || 'My Tasks';
  const isDaily = text.toLowerCase().includes('daily');
  const nextRun = isDaily ? getNextRun('daily') : null;

  if (extracted.network && extracted.network.rpcUrl) {
    await db.saveCustomChain(userId, {
      name: extracted.network.name,
      chain_id: extracted.network.chainId,
      rpc_url: extracted.network.rpcUrl,
      currency_symbol: extracted.network.symbol,
      decimals: 18,
      explorer_url: extracted.network.explorerUrl,
      is_testnet: extracted.network.isTestnet
    }).catch(function() {});
  }

  const chainInfo = extracted.network ? {
    name: extracted.network.name,
    rpcUrl: extracted.network.rpcUrl,
    chainId: extracted.network.chainId,
    symbol: extracted.network.symbol,
    explorerUrl: extracted.network.explorerUrl,
    isTestnet: extracted.network.isTestnet
  } : null;

  await db.saveTaskSet(userId, {
    name: name,
    description: 'From ' + (extracted.projectName || 'announcement'),
    chain_info: chainInfo,
    tasks: extracted.tasks || [],
    repeat_schedule: isDaily ? 'daily' : 'none',
    next_run: nextRun,
    is_active: true
  });

  await ctx.reply(
    'Saved: "' + name + '"\n\n' +
    'Tasks: ' + (extracted.tasks ? extracted.tasks.length : 0) + '\n' +
    'Schedule: ' + (isDaily ? 'Daily auto-run' : 'Manual only') + '\n\n' +
    'Say "Run ' + name + '" to execute it now!'
  );
}

// ─── View Tasks ──────────────────────────────────────────
async function handleViewTasks(ctx, userId) {
  const tasks = await db.getUserTaskSets(userId);
  if (!tasks.length) return ctx.reply('No saved task sets. Paste a testnet announcement to get started!');

  let response = 'Task Sets (' + tasks.length + ')\n\n';
  tasks.forEach(function(t) {
    const schedule = t.repeat_schedule !== 'none' ? 'Repeats: ' + t.repeat_schedule : 'Manual only';
    const lastRun = t.last_run ? new Date(t.last_run).toLocaleDateString() : 'Never';
    response += t.name + '\n' + schedule + ' | ' + (t.tasks ? t.tasks.length : 0) + ' tasks | Last run: ' + lastRun + '\n\n';
  });
  response += 'Say "Run [name]" to execute any task set.';
  await sendLong(ctx, response);
}

// ─── Run Task ────────────────────────────────────────────
async function handleRunTask(ctx, text, userId) {
  const tasks = await db.getUserTaskSets(userId);
  if (!tasks.length) return ctx.reply('No saved tasks. Paste an announcement first!');

  const textLower = text.toLowerCase();
  let taskSet = null;
  for (let i = 0; i < tasks.length; i++) {
    if (textLower.includes(tasks[i].name.toLowerCase())) {
      taskSet = tasks[i];
      break;
    }
  }
  if (!taskSet) taskSet = tasks[0];

  await ctx.reply('Running "' + taskSet.name + '"...\nYou will get notified after each step!');

  runTaskSet(taskSet, ctx.telegram).then(function(results) {
    const ok = results.filter(function(r) { return r.success; }).length;
    const fail = results.filter(function(r) { return !r.success; }).length;
    ctx.reply(taskSet.name + ' done!\nSuccess: ' + ok + ' | Failed: ' + fail + '\n\nSay "Show task history" for details.');
  }).catch(function(err) {
    ctx.reply('Task failed: ' + err.message);
  });
}

// ─── Gas Prices ──────────────────────────────────────────
async function handleCheckGas(ctx) {
  await ctx.reply('Fetching gas prices...');
  const chains = [
    { name: 'Ethereum', rpc: 'https://eth.llamarpc.com' },
    { name: 'BSC', rpc: 'https://bsc-dataseed.binance.org' },
    { name: 'Polygon', rpc: 'https://polygon.llamarpc.com' },
    { name: 'Arbitrum', rpc: 'https://arb1.arbitrum.io/rpc' },
    { name: 'Base', rpc: 'https://mainnet.base.org' }
  ];

  let msg = 'Live Gas Prices (Gwei)\n\n';
  for (let i = 0; i < chains.length; i++) {
    const c = chains[i];
    try {
      const g = await getEVMGasPrice(c.rpc);
      const level = parseFloat(g) < 5 ? 'Low' : parseFloat(g) < 20 ? 'Medium' : 'High';
      msg += c.name + ': ' + g + ' Gwei (' + level + ')\n';
    } catch (e) {
      msg += c.name + ': Unavailable\n';
    }
  }
  await ctx.reply(msg);
}

// ─── History ─────────────────────────────────────────────
async function handleHistory(ctx, userId) {
  const history = await db.getUserTaskHistory(userId, 15);
  if (!history.length) return ctx.reply('No task history yet. Run some tasks first!');

  let msg = 'Recent Task History\n\n';
  history.forEach(function(h) {
    const icon = h.status === 'success' ? 'OK' : 'FAIL';
    msg += '[' + icon + '] ' + h.task_name + '\n';
    msg += 'Wallet: ' + (h.wallet_address ? h.wallet_address.slice(0, 12) : '?') + '... | ' + new Date(h.executed_at).toLocaleDateString() + '\n';
    msg += h.result + '\n';
    if (h.tx_hash) msg += 'TX: ' + h.tx_hash.slice(0, 16) + '...\n';
    msg += '\n';
  });
  await sendLong(ctx, msg);
}

// ─── Story ───────────────────────────────────────────────
async function handleStory(ctx) {
  await ctx.reply('Crafting a story for you...');
  const story = await generateStory();
  await ctx.reply('A Crypto Tale\n\n' + story);
}

module.exports = {
  handleAddChain,
  handleViewChains,
  handleTaskExtraction,
  handleSaveTask,
  handleViewTasks,
  handleRunTask,
  handleCheckGas,
  handleHistory,
  handleStory
};
