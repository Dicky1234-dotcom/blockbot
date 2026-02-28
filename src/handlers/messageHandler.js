const db = require('../services/database');
const walletService = require('../services/wallet');
const { askAI, classifyIntent, extractSwapParamsFromText,
        extractMintParamsFromText, extractFundingParamsFromText } = require('../services/ai');
const { swap, saveCustomDex } = require('../services/swapService');
const { mint, saveNftContract, getNftContracts } = require('../services/nftService');
const { cascadeFund, formatCascadeResults } = require('../services/fundingService');
const { DEFAULT_CHAINS } = require('../config/chains');
const { getEVMGasPrice } = require('../services/wallet');
const taskHandler = require('./taskHandler');

const conversationHistory = {};

function getHistory(userId) {
  if (!conversationHistory[userId]) conversationHistory[userId] = [];
  return conversationHistory[userId];
}

function addToHistory(userId, role, content) {
  const history = getHistory(userId);
  history.push({ role, content });
  if (history.length > 12) history.shift();
}

async function sendLong(ctx, text, options = {}) {
  const chunks = text.match(/.{1,4000}/gs) || [text];
  for (const chunk of chunks) await ctx.reply(chunk, options);
}

async function handleStart(ctx) {
  const userId = ctx.from.id;
  await db.ensureUser(userId, ctx.from.username);
  await ctx.reply(
    '🤖 *Welcome to BlockBot AI!*\n\n' +
    'Your personal blockchain automation assistant.\n\n' +
    '💼 *Wallets* — Create, import and manage EVM, Solana and Aptos wallets\n' +
    '💸 *Cascade Fund* — Fund all wallets from one master wallet\n' +
    '🔄 *Token Swaps* — Swap on Uniswap, PancakeSwap, Jupiter and any fork\n' +
    '🎨 *NFT Minting* — Mint ERC-721, ERC-1155, Solana NFTs and domains\n' +
    '⛓️ *Custom Chains and DEXes* — Add any testnet or mainnet\n' +
    '🤖 *Automation* — Paste any announcement, I extract and repeat tasks\n' +
    '📖 *Stories* — Entertainment while tasks run!\n\n' +
    'Just chat naturally. Type /help to see all commands.',
    { parse_mode: 'Markdown' }
  );
}

async function handleHelp(ctx) {
  await ctx.reply(
    '📚 *All Commands*\n\n' +
    '*Wallets:*\n' +
    '• "Create 3 EVM wallets"\n' +
    '• "Create a Solana wallet"\n' +
    '• "Import wallet [private key]"\n' +
    '• "Show my wallets"\n' +
    '• "Check all balances"\n\n' +
    '*Funding:*\n' +
    '• "Fund all wallets with 0.01 ETH each from [address]"\n' +
    '• "Split 0.5 ETH equally across all wallets from [address]"\n' +
    '• "Send gas money to all wallets from [address]"\n\n' +
    '*Swaps:*\n' +
    '• "Swap 0.1 ETH for [token address] on BSC"\n' +
    '• "Swap 1 SOL for [token mint] on Solana"\n' +
    '• "Add a custom DEX router"\n\n' +
    '*NFT Minting:*\n' +
    '• "Mint NFT from contract [address] on BSC"\n' +
    '• "Mint 3 ERC-1155 token ID 1 from [contract]"\n' +
    '• "Save NFT contract [address] as [name]"\n\n' +
    '*Chains and DEXes:*\n' +
    '• "Add custom chain" then paste RPC details\n' +
    '• "Add DEX router [address] for chain [ID]"\n' +
    '• "Show my chains" / "Check gas prices"\n\n' +
    '*Automation:*\n' +
    '• Paste any testnet announcement\n' +
    '• "Save as [name] and run daily"\n' +
    '• "Run [task name] now"\n' +
    '• "Show my tasks" / "Show task history"\n\n' +
    '*Fun:*\n' +
    '• "Tell me a story while you work"',
    { parse_mode: 'Markdown' }
  );
}

async function handleMessage(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message && ctx.message.text;
  if (!text) return;

  await db.ensureUser(userId, ctx.from.username);
  await ctx.sendChatAction('typing');

  try {
    const intent = await classifyIntent(text);
    addToHistory(userId, 'user', text);

    if (intent === 'create_wallet') return handleCreateWallet(ctx, text, userId);
    if (intent === 'view_wallets') return handleViewWallets(ctx, userId);
    if (intent === 'import_wallet') return handleImportWallet(ctx, text, userId);
    if (intent === 'check_balance') return handleCheckBalance(ctx, userId);
    if (intent === 'send_tokens') return handleSendTokens(ctx);
    if (intent === 'swap_tokens') return handleSwapTokens(ctx, text, userId);
    if (intent === 'add_dex') return handleAddDex(ctx, text, userId);
    if (intent === 'mint_nft') return handleMintNFT(ctx, text, userId);
    if (intent === 'add_nft_contract') return handleAddNftContract(ctx, text, userId);
    if (intent === 'cascade_fund') return handleCascadeFund(ctx, text, userId);
    if (intent === 'add_chain') return taskHandler.handleAddChain(ctx, text, userId);
    if (intent === 'view_chains') return taskHandler.handleViewChains(ctx, userId);
    if (intent === 'task_extraction') return taskHandler.handleTaskExtraction(ctx, text, userId, getHistory, addToHistory);
    if (intent === 'save_task') return taskHandler.handleSaveTask(ctx, text, userId, getHistory);
    if (intent === 'view_tasks') return taskHandler.handleViewTasks(ctx, userId);
    if (intent === 'run_task') return taskHandler.handleRunTask(ctx, text, userId);
    if (intent === 'check_gas') return taskHandler.handleCheckGas(ctx);
    if (intent === 'history') return taskHandler.handleHistory(ctx, userId);
    if (intent === 'story') return taskHandler.handleStory(ctx);
    return handleGeneral(ctx, text, userId);

  } catch (err) {
    console.error('Handler error:', err);
    await ctx.reply('Something went wrong: ' + err.message + '\n\nTry again or type /help');
  }
}

async function handleCreateWallet(ctx, text, userId) {
  const t = text.toLowerCase();
  let chain = 'evm';
  if (t.includes('solana') || t.includes(' sol ')) chain = 'solana';
  else if (t.includes('aptos') || t.includes(' apt')) chain = 'aptos';

  const countMatch = text.match(/(\d+)\s+wallet/i) || text.match(/(\d+)\s+(?:evm|solana|aptos)/i);
  const count = Math.min(parseInt(countMatch && countMatch[1]) || 1, 20);

  await ctx.reply('Creating ' + count + ' ' + chain.toUpperCase() + ' wallet' + (count > 1 ? 's' : '') + '...');

  let response = 'Created ' + count + ' ' + chain.toUpperCase() + ' wallet' + (count > 1 ? 's' : '') + '\n\n';
  for (let i = 0; i < count; i++) {
    const w = await walletService.createWallet(chain);
    const stored = walletService.prepareForStorage(w, chain.toUpperCase() + ' #' + Date.now() + '-' + i);
    await db.saveWallet(userId, stored);
    response += 'Address: ' + w.address + '\nKey: ' + w.privateKey + '\n';
    if (w.mnemonic) response += 'Mnemonic: ' + w.mnemonic + '\n';
    response += '\n';
  }
  response += 'Back up your private keys — stored encrypted but save them yourself too!';
  await sendLong(ctx, response);
}

async function handleImportWallet(ctx, text, userId) {
  const pkMatch = text.match(/0x[a-fA-F0-9]{64}/);
  const solanaKeyMatch = text.match(/[1-9A-HJ-NP-Za-km-z]{87,88}/);
  let privateKey, chain, address;

  if (pkMatch) {
    privateKey = pkMatch[0];
    chain = 'evm';
    const { ethers } = require('ethers');
    address = new ethers.Wallet(privateKey).address;
  } else if (solanaKeyMatch) {
    privateKey = solanaKeyMatch[0];
    chain = 'solana';
    const bs58 = require('bs58');
    const { Keypair } = require('@solana/web3.js');
    const kp = Keypair.fromSecretKey(bs58.default.decode(privateKey));
    address = kp.publicKey.toString();
  } else {
    return ctx.reply('To import: send your private key\nEVM: 0x[64 hex chars]\nSolana: [base58 key]');
  }

  const existing = await db.getWalletByAddress(userId, address);
  if (existing) return ctx.reply('Wallet already saved: ' + address);

  const stored = walletService.prepareForStorage({ address, privateKey, chain }, 'Imported ' + chain.toUpperCase());
  await db.saveWallet(userId, stored);
  await ctx.reply('Wallet imported!\nChain: ' + chain.toUpperCase() + '\nAddress: ' + address);
}

async function handleViewWallets(ctx, userId) {
  const wallets = await db.getUserWallets(userId);
  if (!wallets.length) return ctx.reply('No wallets yet. Say "Create an EVM wallet" to get started!');

  let response = 'Your Wallets (' + wallets.length + ')\n\n';
  for (const w of wallets) {
    response += w.name + '\nChain: ' + w.chain.toUpperCase() + '\nAddress: ' + w.address + '\nAdded: ' + new Date(w.created_at).toLocaleDateString() + '\n\n';
  }
  await sendLong(ctx, response);
}

async function handleCheckBalance(ctx, userId) {
  const wallets = await db.getUserWallets(userId);
  if (!wallets.length) return ctx.reply('No wallets found. Create one first!');
  await ctx.reply('Fetching balances...');
  let response = 'Balances\n\n';
  for (const w of wallets.slice(0, 10)) {
    const rpc = w.chain === 'solana' ? DEFAULT_CHAINS.solanaMainnet.rpcUrl
              : w.chain === 'aptos' ? DEFAULT_CHAINS.aptosMainnet.rpcUrl
              : DEFAULT_CHAINS.ethereum.rpcUrl;
    try {
      const bal = await walletService.getBalance(w.address, w.chain, rpc);
      response += w.name + '\n' + w.address + '\nBalance: ' + bal + '\n\n';
    } catch (e) {
      response += w.name + ': Error fetching balance\n\n';
    }
  }
  await sendLong(ctx, response);
}

async function handleSendTokens(ctx) {
  await ctx.reply('To send tokens:\n\n"Send 0.01 ETH from [your address] to [destination] on Ethereum"\n\nOr for Solana:\n"Send 0.1 SOL from [address] to [destination]"');
}

async function handleSwapTokens(ctx, text, userId) {
  const params = await extractSwapParamsFromText(text);
  if (!params || !params.toToken) {
    return ctx.reply('To swap:\n"Swap 0.1 ETH for [token address] on BSC"\n"Swap 1 SOL for [mint address] on Solana"');
  }

  const chain = params.chain || 'evm';
  const wallets = await db.getUserWallets(userId, chain === 'solana' ? 'solana' : 'evm');
  if (!wallets.length) return ctx.reply('No ' + chain + ' wallets found. Create one first!');

  const wallet = wallets[0];
  const privateKey = walletService.getPrivateKey(wallet.encrypted_private_key);
  const chainConfig = Object.values(DEFAULT_CHAINS).find(function(c) { return c.type === chain && !c.isTestnet; });
  const rpcUrl = (chainConfig && chainConfig.rpcUrl) || DEFAULT_CHAINS.ethereum.rpcUrl;
  const chainId = (chainConfig && chainConfig.chainId) || '1';

  await ctx.reply('Swapping on ' + chain.toUpperCase() + '...\nWallet: ' + wallet.address.slice(0, 16) + '...');

  const result = await swap({ chain, privateKey, fromToken: params.fromToken || 'native',
    toToken: params.toToken, amountIn: params.amount, slippage: params.slippage || 1,
    rpcUrl, chainId, userId });

  if (result.needsDexInfo) {
    addToHistory(userId, 'assistant', 'PENDING_SWAP:' + JSON.stringify({ params, wallet: wallet.address }));
    return ctx.reply('No DEX found for this chain.\n\nPlease provide:\nRouter: 0x...\nWETH: 0x...\nName: MyDEX\nChain ID: [number]\n\nI will save it and retry!');
  }

  const txLine = result.txHash ? '\nTX: ' + result.txHash.slice(0, 20) + '...' : '';
  await ctx.reply(result.message + txLine);
}

async function handleAddDex(ctx, text, userId) {
  const routerMatch = text.match(/(0x[a-fA-F0-9]{40})/);
  const wethMatch = text.match(/(?:weth|wrapped|wbnb|wmatic)[:\s]+(0x[a-fA-F0-9]{40})/i);
  const chainMatch = text.match(/(?:chain\s*id|chain)[:\s]+(\d+)/i);
  const nameMatch = text.match(/(?:name|dex)[:\s]+([A-Za-z0-9 ]+?)(?:\n|router|$)/i);

  if (!routerMatch) {
    return ctx.reply('To add a custom DEX:\nName: PancakeSwap Fork\nChain ID: 56\nRouter: 0x...\nWETH: 0x...');
  }

  const chainId = (chainMatch && chainMatch[1]) || '1';
  const routerAddress = routerMatch[1];
  const wethAddress = (wethMatch && wethMatch[1]) || null;
  const name = (nameMatch && nameMatch[1].trim()) || 'Custom DEX Chain ' + chainId;

  await saveCustomDex(userId, { chainId, name, routerAddress, wethAddress });
  await ctx.reply('DEX Saved!\nName: ' + name + '\nChain ID: ' + chainId + '\nRouter: ' + routerAddress);

  const history = getHistory(userId);
  const pending = [...history].reverse().find(function(h) { return h.content && h.content.startsWith('PENDING_SWAP:'); });
  if (pending) {
    const swapData = JSON.parse(pending.content.replace('PENDING_SWAP:', ''));
    const w = await db.getWalletByAddress(userId, swapData.wallet);
    if (w) {
      await ctx.reply('Retrying your pending swap...');
      const pk = walletService.getPrivateKey(w.encrypted_private_key);
      const result = await swap(Object.assign({}, swapData.params, { privateKey: pk, rpcUrl: DEFAULT_CHAINS.ethereum.rpcUrl, chainId, userId }));
      await ctx.reply(result.message);
    }
  }
}

async function handleMintNFT(ctx, text, userId) {
  const params = await extractMintParamsFromText(text);
  if (!params || !params.contractAddress) {
    const saved = await getNftContracts(userId);
    if (saved.length) {
      let msg = 'Saved NFT Contracts:\n\n';
      saved.forEach(function(c) { msg += c.name + ' - ' + c.contract_address.slice(0, 16) + '... (' + c.type + ')\n'; });
      msg += '\nWhich should I mint from? Or provide a new contract address.';
      return ctx.reply(msg);
    }
    return ctx.reply('I need the NFT contract address.\n\n"Mint from contract 0x... on BSC"\n\nOr save it first:\n"Save NFT contract 0x... as [name] on chain [ID]"');
  }

  const wallets = await db.getUserWallets(userId);
  if (!wallets.length) return ctx.reply('No wallets found. Create one first!');

  const wallet = wallets[0];
  const privateKey = walletService.getPrivateKey(wallet.encrypted_private_key);

  await ctx.reply('Minting NFT...\nContract: ' + params.contractAddress.slice(0, 16) + '...\nWallet: ' + wallet.address.slice(0, 16) + '...');

  const result = await mint({ type: params.type || 'ERC721', privateKey,
    contractAddress: params.contractAddress, rpcUrl: DEFAULT_CHAINS.ethereum.rpcUrl, userId,
    options: { quantity: params.quantity || 1, tokenId: params.tokenId || 0, domainName: params.domainName } });

  if (result.success) {
    await saveNftContract(userId, { chainId: '1', contractAddress: params.contractAddress,
      name: 'NFT ' + params.contractAddress.slice(0, 8), type: params.type || 'ERC721' }).catch(function() {});
  }
  await ctx.reply(result.message);
}

async function handleAddNftContract(ctx, text, userId) {
  const contractMatch = text.match(/(0x[a-fA-F0-9]{40})/);
  const nameMatch = text.match(/(?:as|name)[:\s]+([A-Za-z0-9 ]+?)(?:\n|chain|$)/i);
  const chainMatch = text.match(/(?:chain\s*id|chain)[:\s]+(\d+)/i);
  const typeMatch = text.match(/\b(ERC721|ERC1155)\b/i);

  if (!contractMatch) return ctx.reply('Provide contract address:\n"Save NFT contract 0x... as [Name] on chain [ID]"');

  const contractAddress = contractMatch[1];
  const name = (nameMatch && nameMatch[1].trim()) || 'NFT ' + contractAddress.slice(0, 8);
  const chainId = (chainMatch && chainMatch[1]) || '1';
  const type = typeMatch ? typeMatch[1].toUpperCase() : 'ERC721';

  await saveNftContract(userId, { chainId, contractAddress, name, type });
  await ctx.reply('NFT Contract Saved!\nName: ' + name + '\nType: ' + type + '\nChain ID: ' + chainId + '\nContract: ' + contractAddress + '\n\nSay "Mint NFT from ' + name + '" to use it!');
}

async function handleCascadeFund(ctx, text, userId) {
  const params = await extractFundingParamsFromText(text);
  const wallets = await db.getUserWallets(userId);

  if (wallets.length < 2) return ctx.reply('You need at least 2 wallets for cascade funding. Create more wallets first!');

  if (!params || !params.masterAddress) {
    let msg = 'Cascade Funding Setup\n\nYour wallets:\n';
    wallets.forEach(function(w, i) { msg += (i + 1) + '. ' + w.address.slice(0, 16) + '... (' + w.chain.toUpperCase() + ')\n'; });
    msg += '\nTell me:\n"Fund all wallets with 0.01 ETH each from wallet 1"\n"Split 0.5 ETH from [address] equally across all wallets"';
    return ctx.reply(msg);
  }

  let masterAddress = params.masterAddress;
  if (masterAddress.match(/^\d+$/)) masterAddress = wallets[parseInt(masterAddress) - 1] && wallets[parseInt(masterAddress) - 1].address;
  if (!masterAddress) return ctx.reply('Could not find that wallet. Please provide the full address.');

  const masterWallet = wallets.find(function(w) { return w.address.toLowerCase() === masterAddress.toLowerCase(); });
  if (!masterWallet) return ctx.reply('Master wallet not found: ' + masterAddress);

  const targets = wallets.filter(function(w) { return w.address !== masterAddress && w.chain === masterWallet.chain; });
  if (!targets.length) return ctx.reply('No other wallets on the same chain to fund!');

  const rpcUrl = masterWallet.chain === 'solana' ? DEFAULT_CHAINS.solanaMainnet.rpcUrl : DEFAULT_CHAINS.ethereum.rpcUrl;

  await ctx.reply('Starting cascade funding...\nMaster: ' + masterAddress.slice(0, 16) + '...\nTargets: ' + targets.length + ' wallets\nMode: ' + (params.mode || 'fixed'));

  const results = await cascadeFund({ userId, masterWalletAddress: masterAddress,
    mode: params.mode || 'fixed', amountPerWallet: params.amountPerWallet,
    totalAmount: params.totalAmount, targetChain: masterWallet.chain, rpcUrl,
    targetWalletAddresses: targets.map(function(w) { return w.address; }) });

  const summary = formatCascadeResults(results, masterWallet.chain, null);
  await sendLong(ctx, summary);
}

async function handleGeneral(ctx, text, userId) {
  const history = getHistory(userId).filter(function(h) {
    return !h.content || (!h.content.startsWith('EXTRACTED_TASK:') && !h.content.startsWith('PENDING_'));
  });
  const response = await askAI(text, history);
  addToHistory(userId, 'assistant', response);
  await ctx.reply(response);
}

module.exports = { handleStart, handleHelp, handleMessage };
