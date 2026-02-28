const walletService = require('./wallet');
const db = require('./database');
const { explainError } = require('./ai');
const { swap } = require('./swapService');
const { mint } = require('./nftService');
const { DEFAULT_CHAINS } = require('../config/chains');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const humanDelay = () => sleep(Math.random() * 3000 + 1000);

// ─── Detect task type and execute accordingly ─────────────
async function executeTask(task, walletData, chainConfig, userId) {
  const pk = walletService.getPrivateKey(walletData.encrypted_private_key);
  const rpcUrl = chainConfig?.rpcUrl || chainConfig?.rpc_url || DEFAULT_CHAINS.ethereum.rpcUrl;
  const chainId = chainConfig?.chainId || chainConfig?.chain_id || '1';
  const result = { success: false, txHash: null, message: '' };

  try {
    await humanDelay();
    const t = task.toLowerCase();

    // ── Swap ───────────────────────────────────────
    if (t.includes('swap')) {
      const amountMatch = task.match(/(\d+\.?\d*)/);
      const tokenMatch = task.match(/for\s+(0x[a-fA-F0-9]{40})/i);
      const swapResult = await swap({
        chain: walletData.chain,
        privateKey: pk,
        fromToken: 'native',
        toToken: tokenMatch?.[1] || 'native',
        amountIn: amountMatch ? parseFloat(amountMatch[1]) : 0.001,
        slippage: 1,
        rpcUrl, chainId, userId
      });
      return { success: swapResult.success, txHash: swapResult.txHash, message: swapResult.message };
    }

    // ── Mint NFT ───────────────────────────────────
    if (t.includes('mint') || t.includes('nft')) {
      const contractMatch = task.match(/(0x[a-fA-F0-9]{40})/);
      const mintResult = await mint({
        type: t.includes('1155') ? 'ERC1155' : t.includes('domain') ? 'DOMAIN' : 'ERC721',
        privateKey: pk,
        contractAddress: contractMatch?.[1] || null,
        rpcUrl, chainId, userId
      });
      return { success: mintResult.success, txHash: mintResult.txHash, message: mintResult.message };
    }

    // ── Faucet ─────────────────────────────────────
    if (t.includes('faucet') || t.includes('claim')) {
      if (walletData.chain === 'solana') {
        const sig = await walletService.requestSolanaAirdrop(walletData.address, rpcUrl);
        return { success: true, txHash: sig, message: `✅ Claimed 1 SOL faucet` };
      }
      if (walletData.chain === 'aptos' && (chainConfig?.isTestnet || chainConfig?.is_testnet)) {
        await walletService.fundAptosTestnet(walletData.address);
        return { success: true, message: `✅ Aptos testnet faucet claimed` };
      }
      return { success: false, message: `⚠️ EVM faucet needs contract address` };
    }

    // ── Balance Check ──────────────────────────────
    if (t.includes('balance') || t.includes('check')) {
      const bal = await walletService.getBalance(walletData.address, walletData.chain, rpcUrl);
      return { success: true, message: `💰 Balance: ${bal} ${chainConfig?.symbol || chainConfig?.currency_symbol || ''}` };
    }

    // ── Send ───────────────────────────────────────
    if (t.includes('send') || t.includes('transfer')) {
      const amountMatch = task.match(/(\d+\.?\d*)/);
      const toMatch = task.match(/to\s+(0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})/i);
      if (!amountMatch || !toMatch) return { success: false, message: `⚠️ Specify amount and destination for send` };
      if (walletData.chain === 'solana') {
        const sig = await walletService.sendSolanaTokens(pk, toMatch[1], parseFloat(amountMatch[1]), rpcUrl);
        return { success: true, txHash: sig, message: `✅ Sent ${amountMatch[1]} SOL` };
      }
      const hash = await walletService.sendEVMTokens(pk, toMatch[1], parseFloat(amountMatch[1]), rpcUrl);
      return { success: true, txHash: hash, message: `✅ Sent ${amountMatch[1]} ETH` };
    }

    // ── Generic ────────────────────────────────────
    result.success = true;
    result.message = `✅ Task noted: "${task}" — may need browser automation (V2 feature)`;
    return result;

  } catch (err) {
    const friendly = await explainError(err.message, task);
    return { success: false, message: `❌ ${friendly}` };
  }
}

async function runTaskSet(taskSet, telegramBot = null) {
  const userId = taskSet.user_id;
  const results = [];
  const chainConfig = taskSet.chain_info;
  if (!chainConfig) return [{ success: false, message: 'No chain config for this task set.' }];

  const wallets = await db.getUserWallets(userId);
  if (!wallets.length) return [{ success: false, message: 'No wallets found.' }];

  for (const wallet of wallets.slice(0, 5)) {
    for (const task of (taskSet.tasks || [])) {
      if (telegramBot) {
        await telegramBot.sendMessage(userId, `⏳ "${task}" on \`${wallet.address.slice(0, 10)}...\``, { parse_mode: 'Markdown' }).catch(() => {});
      }

      const r = await executeTask(task, wallet, chainConfig, userId);
      await db.logTaskHistory(userId, {
        task_set_id: taskSet.id, wallet_address: wallet.address,
        task_name: task, status: r.success ? 'success' : 'failed',
        result: r.message, tx_hash: r.txHash || null
      });
      results.push({ wallet: wallet.address.slice(0, 10), task, ...r });

      if (telegramBot) {
        const explorerUrl = chainConfig.explorerUrl || chainConfig.explorer_url;
        const txLink = explorerUrl && r.txHash ? `\n🔗 [TX](${explorerUrl}/tx/${r.txHash})` : '';
        await telegramBot.sendMessage(userId, `${r.message}${txLink}`, { parse_mode: 'Markdown' }).catch(() => {});
      }

      await humanDelay();
    }
  }

  const nextRun = getNextRun(taskSet.repeat_schedule);
  await db.updateTaskSet(taskSet.id, { last_run: new Date().toISOString(), next_run: nextRun });
  return results;
}

function getNextRun(schedule) {
  if (!schedule || schedule === 'none') return null;
  const now = new Date();
  if (schedule === 'daily') return new Date(now.getTime() + 86400000).toISOString();
  if (schedule === 'weekly') return new Date(now.getTime() + 604800000).toISOString();
  if (schedule === 'hourly') return new Date(now.getTime() + 3600000).toISOString();
  return new Date(now.getTime() + 86400000).toISOString();
}

module.exports = { executeTask, runTaskSet, getNextRun };
