const { ethers } = require('ethers');
const { Connection, PublicKey, VersionedTransaction } = require('@solana/web3.js');
const fetch = require('node-fetch');
const db = require('./database');

// ─── Standard UniswapV2 Router ABI (works for ALL V2 forks) ──
const UNISWAP_V2_ROUTER_ABI = [
  'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
  'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
  'function WETH() external pure returns (address)'
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
];

// ─── Built-in DEX configs keyed by chainId ───────────────
// Any UniswapV2 fork on any chain just needs router + weth address
const BUILTIN_DEX = {
  '1':        { name: 'Uniswap V2',          router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  '56':       { name: 'PancakeSwap V2',       router: '0x10ED43C718714eb63d5aA57B78B54704E256024E', weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' },
  '137':      { name: 'QuickSwap',            router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' },
  '42161':    { name: 'Uniswap V2 Arbitrum',  router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  '8453':     { name: 'Uniswap V2 Base',      router: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', weth: '0x4200000000000000000000000000000000000006' },
  '10':       { name: 'Uniswap V2 Optimism',  router: '0x4A7b5Da61326A6379179b40d00F57E5bbDC962c2', weth: '0x4200000000000000000000000000000000000006' },
  '97':       { name: 'PancakeSwap Testnet',  router: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1', weth: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd' },
  '11155111': { name: 'Uniswap V2 Sepolia',   router: '0xC532a74256D3Db42D0Bf7a0400fEFDbad7694008', weth: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9' },
  '80001':    { name: 'QuickSwap Mumbai',      router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff', weth: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889' },
};

// ─── Custom DEX storage (saved per user in DB) ───────────
async function saveCustomDex(userId, { chainId, name, routerAddress, abi, wethAddress }) {
  const abiToStore = abi || JSON.stringify(UNISWAP_V2_ROUTER_ABI);
  return db.saveCustomDex(userId, { chain_id: chainId, name, router_address: routerAddress, abi: abiToStore, weth_address: wethAddress });
}

async function getCustomDex(userId, chainId) {
  return db.getCustomDex(userId, chainId);
}

// ─── Resolve DEX for a chain ─────────────────────────────
async function resolveDex(chainId, userId) {
  // 1. Check built-in
  if (BUILTIN_DEX[chainId]) return { ...BUILTIN_DEX[chainId], abi: UNISWAP_V2_ROUTER_ABI };

  // 2. Check user-saved custom DEX
  const custom = await getCustomDex(userId, chainId);
  if (custom) {
    return {
      name: custom.name,
      router: custom.router_address,
      weth: custom.weth_address,
      abi: JSON.parse(custom.abi)
    };
  }

  return null;
}

// ─── EVM Swap ─────────────────────────────────────────────
async function swapEVM({ privateKey, fromToken, toToken, amountIn, slippage = 1, rpcUrl, chainId, userId }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const dex = await resolveDex(String(chainId), userId);
  if (!dex) {
    return {
      success: false,
      needsDexInfo: true,
      message: `No DEX found for chain ${chainId}. I need the router address to proceed.`
    };
  }

  const router = new ethers.Contract(dex.router, dex.abi, wallet);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
  const WETH = dex.weth;

  const isFromNative = !fromToken || fromToken.toLowerCase() === 'native' || fromToken.toLowerCase() === 'eth' || fromToken.toLowerCase() === 'bnb';
  const isToNative = !toToken || toToken.toLowerCase() === 'native' || toToken.toLowerCase() === 'eth' || toToken.toLowerCase() === 'bnb';

  try {
    // ── Native → Token ──
    if (isFromNative && !isToNative) {
      const amountInWei = ethers.parseEther(String(amountIn));
      const path = [WETH, toToken];
      const amounts = await router.getAmountsOut(amountInWei, path);
      const amountOutMin = amounts[1] * BigInt(Math.floor((100 - slippage) * 100)) / 10000n;

      const tx = await router.swapExactETHForTokens(amountOutMin, path, wallet.address, deadline, { value: amountInWei });
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: `✅ Swapped ${amountIn} native → token\nDEX: ${dex.name}` };
    }

    // ── Token → Native ──
    if (!isFromNative && isToNative) {
      const tokenContract = new ethers.Contract(fromToken, ERC20_ABI, wallet);
      const decimals = await tokenContract.decimals();
      const amountInWei = ethers.parseUnits(String(amountIn), decimals);

      // Approve router
      const allowance = await tokenContract.allowance(wallet.address, dex.router);
      if (allowance < amountInWei) {
        const approveTx = await tokenContract.approve(dex.router, ethers.MaxUint256);
        await approveTx.wait();
      }

      const path = [fromToken, WETH];
      const amounts = await router.getAmountsOut(amountInWei, path);
      const amountOutMin = amounts[1] * BigInt(Math.floor((100 - slippage) * 100)) / 10000n;

      const tx = await router.swapExactTokensForETH(amountInWei, amountOutMin, path, wallet.address, deadline);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: `✅ Swapped ${amountIn} token → native\nDEX: ${dex.name}` };
    }

    // ── Token → Token ──
    if (!isFromNative && !isToNative) {
      const tokenContract = new ethers.Contract(fromToken, ERC20_ABI, wallet);
      const decimals = await tokenContract.decimals();
      const amountInWei = ethers.parseUnits(String(amountIn), decimals);

      const allowance = await tokenContract.allowance(wallet.address, dex.router);
      if (allowance < amountInWei) {
        const approveTx = await tokenContract.approve(dex.router, ethers.MaxUint256);
        await approveTx.wait();
      }

      const path = [fromToken, WETH, toToken];
      const amounts = await router.getAmountsOut(amountInWei, path);
      const amountOutMin = amounts[2] * BigInt(Math.floor((100 - slippage) * 100)) / 10000n;

      const tx = await router.swapExactTokensForTokens(amountInWei, amountOutMin, path, wallet.address, deadline);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, message: `✅ Swapped token → token\nDEX: ${dex.name}` };
    }

  } catch (err) {
    return { success: false, message: err.message };
  }
}

// ─── Solana Jupiter Swap ──────────────────────────────────
async function swapSolana({ privateKeyBase58, fromMint, toMint, amountIn, slippage = 50, rpcUrl }) {
  try {
    const bs58 = require('bs58');
    const { Keypair } = require('@solana/web3.js');
    const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

    const secretKey = bs58.default.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);

    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const inputMint = fromMint === 'native' || fromMint === 'SOL' ? SOL_MINT : fromMint;
    const outputMint = toMint === 'native' || toMint === 'SOL' ? SOL_MINT : toMint;
    const amount = Math.floor(amountIn * LAMPORTS_PER_SOL);

    // Get quote from Jupiter API
    const quoteRes = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage}`
    );
    const quote = await quoteRes.json();
    if (!quote.outAmount) throw new Error('No route found on Jupiter');

    // Get swap transaction
    const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true
      })
    });
    const { swapTransaction } = await swapRes.json();

    // Deserialize and sign
    const connection = new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const txBuf = Buffer.from(swapTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBuf);
    tx.sign([keypair]);

    const sig = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(sig, 'confirmed');

    return { success: true, txHash: sig, message: `✅ Jupiter swap complete!\nTX: ${sig.slice(0, 16)}...` };
  } catch (err) {
    return { success: false, message: `Jupiter swap failed: ${err.message}` };
  }
}

// ─── Universal Swap Entry Point ───────────────────────────
async function swap({ chain, privateKey, fromToken, toToken, amountIn, slippage, rpcUrl, chainId, userId }) {
  if (chain === 'solana') {
    return swapSolana({ privateKeyBase58: privateKey, fromMint: fromToken, toMint: toToken, amountIn, slippage, rpcUrl });
  }
  return swapEVM({ privateKey, fromToken, toToken, amountIn, slippage, rpcUrl, chainId, userId });
}

module.exports = { swap, swapEVM, swapSolana, saveCustomDex, resolveDex, UNISWAP_V2_ROUTER_ABI };
