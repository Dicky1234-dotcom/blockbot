const { ethers } = require('ethers');
const { Connection, Keypair, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Account, Aptos, AptosConfig } = require('@aptos-labs/ts-sdk');
const bs58 = require('bs58');
const db = require('./database');
const walletService = require('./wallet');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Funding Modes ────────────────────────────────────────
// 'equal'    - split total equally across all wallets
// 'fixed'    - send fixed amount to each wallet
// 'gas_only' - send just enough for gas fees

// ─── Estimate minimum gas cost per wallet ────────────────
async function estimateGasAmount(chain, rpcUrl) {
  try {
    if (chain === 'evm') {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const feeData = await provider.getFeeData();
      // Estimate ~21000 gas for a simple transfer, x3 buffer
      const gasPrice = feeData.gasPrice || ethers.parseUnits('5', 'gwei');
      const gasLimit = 21000n * 3n;
      return gasPrice * gasLimit;
    }
    if (chain === 'solana') return BigInt(Math.floor(0.01 * LAMPORTS_PER_SOL)); // 0.01 SOL
    if (chain === 'aptos') return BigInt(1000); // 0.00001 APT in octas
    return ethers.parseEther('0.001');
  } catch (_) {
    return ethers.parseEther('0.001');
  }
}

// ─── EVM Cascade Fund ─────────────────────────────────────
async function cascadeFundEVM({ masterPrivateKey, targetWallets, mode, amountPerWallet, totalAmount, rpcUrl }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const masterWallet = new ethers.Wallet(masterPrivateKey, provider);

  const masterBalance = await provider.getBalance(masterWallet.address);
  const results = [];

  // Calculate amount per wallet
  let sendAmount;
  if (mode === 'equal' && totalAmount) {
    const total = ethers.parseEther(String(totalAmount));
    sendAmount = total / BigInt(targetWallets.length);
  } else if (mode === 'fixed' && amountPerWallet) {
    sendAmount = ethers.parseEther(String(amountPerWallet));
  } else if (mode === 'gas_only') {
    sendAmount = await estimateGasAmount('evm', rpcUrl);
  } else {
    sendAmount = ethers.parseEther(String(amountPerWallet || '0.001'));
  }

  // Check master balance is sufficient
  const totalNeeded = sendAmount * BigInt(targetWallets.length);
  if (masterBalance < totalNeeded) {
    return [{
      success: false,
      message: `Insufficient balance. Master wallet has ${ethers.formatEther(masterBalance)} ETH, needs ${ethers.formatEther(totalNeeded)} ETH for ${targetWallets.length} wallets.`
    }];
  }

  for (const targetAddress of targetWallets) {
    try {
      const nonce = await provider.getTransactionCount(masterWallet.address, 'pending');
      const tx = await masterWallet.sendTransaction({
        to: targetAddress,
        value: sendAmount,
        nonce
      });
      await tx.wait();

      results.push({
        success: true,
        address: targetAddress,
        amount: ethers.formatEther(sendAmount),
        txHash: tx.hash,
        message: `✅ Funded ${targetAddress.slice(0, 10)}... with ${ethers.formatEther(sendAmount)} ETH`
      });

      await sleep(1500); // Avoid nonce issues
    } catch (err) {
      results.push({
        success: false,
        address: targetAddress,
        message: `❌ Failed to fund ${targetAddress.slice(0, 10)}...: ${err.message}`
      });
    }
  }

  return results;
}

// ─── Solana Cascade Fund ──────────────────────────────────
async function cascadeFundSolana({ masterPrivateKeyBase58, targetWallets, mode, amountPerWallet, totalAmount, rpcUrl }) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const secretKey = bs58.default.decode(masterPrivateKeyBase58);
  const masterKeypair = Keypair.fromSecretKey(secretKey);

  const masterBalance = await connection.getBalance(masterKeypair.publicKey);
  const results = [];

  let lamportsEach;
  if (mode === 'equal' && totalAmount) {
    lamportsEach = Math.floor((totalAmount * LAMPORTS_PER_SOL) / targetWallets.length);
  } else if (mode === 'fixed' && amountPerWallet) {
    lamportsEach = Math.floor(amountPerWallet * LAMPORTS_PER_SOL);
  } else if (mode === 'gas_only') {
    lamportsEach = Math.floor(0.005 * LAMPORTS_PER_SOL); // 0.005 SOL per wallet
  } else {
    lamportsEach = Math.floor((amountPerWallet || 0.01) * LAMPORTS_PER_SOL);
  }

  const totalNeeded = lamportsEach * targetWallets.length;
  if (masterBalance < totalNeeded) {
    return [{
      success: false,
      message: `Insufficient SOL. Master has ${(masterBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL, needs ${(totalNeeded / LAMPORTS_PER_SOL).toFixed(4)} SOL.`
    }];
  }

  for (const targetAddress of targetWallets) {
    try {
      const toPubkey = new PublicKey(targetAddress);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: masterKeypair.publicKey,
          toPubkey,
          lamports: lamportsEach
        })
      );

      const sig = await connection.sendTransaction(tx, [masterKeypair]);
      await connection.confirmTransaction(sig);

      results.push({
        success: true,
        address: targetAddress,
        amount: (lamportsEach / LAMPORTS_PER_SOL).toFixed(4),
        txHash: sig,
        message: `✅ Funded ${targetAddress.slice(0, 10)}... with ${(lamportsEach / LAMPORTS_PER_SOL).toFixed(4)} SOL`
      });

      await sleep(1000);
    } catch (err) {
      results.push({
        success: false,
        address: targetAddress,
        message: `❌ Failed: ${err.message}`
      });
    }
  }

  return results;
}

// ─── Universal Cascade Fund Entry Point ──────────────────
async function cascadeFund({ userId, masterWalletAddress, mode, amountPerWallet, totalAmount, targetChain, rpcUrl, targetWalletAddresses }) {
  // Get master wallet
  const masterWalletData = await db.getWalletByAddress(userId, masterWalletAddress);
  if (!masterWalletData) throw new Error('Master wallet not found. Make sure the address belongs to your account.');

  const masterPrivateKey = walletService.getPrivateKey(masterWalletData.encrypted_private_key);

  // Get target wallets (all user wallets of that chain, or specified list)
  let targets = targetWalletAddresses;
  if (!targets || !targets.length) {
    const allWallets = await db.getUserWallets(userId, targetChain);
    targets = allWallets
      .filter(w => w.address !== masterWalletAddress)
      .map(w => w.address);
  }

  if (!targets.length) return [{ success: false, message: 'No target wallets found to fund.' }];

  const chain = masterWalletData.chain;

  if (chain === 'solana') {
    return cascadeFundSolana({
      masterPrivateKeyBase58: masterPrivateKey,
      targetWallets: targets,
      mode, amountPerWallet, totalAmount, rpcUrl
    });
  }

  // EVM (covers all EVM chains including custom)
  return cascadeFundEVM({
    masterPrivateKey,
    targetWallets: targets,
    mode, amountPerWallet, totalAmount, rpcUrl
  });
}

// ─── Format cascade results for Telegram ─────────────────
function formatCascadeResults(results, chain, explorerUrl) {
  const success = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  let msg = `💸 *Cascade Funding Complete*\n\n`;
  msg += `✅ Funded: ${success.length} wallets\n`;
  msg += `❌ Failed: ${failed.length} wallets\n\n`;

  for (const r of success) {
    const txLink = explorerUrl && r.txHash ? `[TX](${explorerUrl}/tx/${r.txHash})` : r.txHash?.slice(0, 12) + '...';
    msg += `• \`${r.address?.slice(0, 12)}...\` → ${r.amount} | ${txLink}\n`;
  }

  if (failed.length) {
    msg += `\n*Failed:*\n`;
    for (const r of failed) msg += `• ${r.message}\n`;
  }

  return msg;
}

module.exports = { cascadeFund, formatCascadeResults, estimateGasAmount };
