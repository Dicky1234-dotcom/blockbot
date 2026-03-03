const { ethers } = require('ethers');
const { Keypair, Connection, PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } = require('@solana/web3.js');
const { Aptos, AptosConfig, Network, Account } = require('@aptos-labs/ts-sdk');
const { encrypt, decrypt } = require('../utils/encryption');
const bip39 = require('bip39');
const bs58 = require('bs58');

// ─── EVM Wallet ─────────────────────────────────────────
async function createEVMWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || null,
    chain: 'evm'
  };
}

async function getEVMBalance(address, rpcUrl) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const balance = await provider.getBalance(address);
    return ethers.formatEther(balance);
  } catch (e) {
    throw new Error(`Failed to get EVM balance: ${e.message}`);
  }
}

async function sendEVMTokens(privateKey, toAddress, amount, rpcUrl) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const tx = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(amount.toString())
    });
    await tx.wait();
    return tx.hash;
  } catch (e) {
    throw new Error(`EVM transfer failed: ${e.message}`);
  }
}

async function getEVMGasPrice(rpcUrl) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const feeData = await provider.getFeeData();
    const gasPriceGwei = ethers.formatUnits(feeData.gasPrice || 0n, 'gwei');
    return parseFloat(gasPriceGwei).toFixed(2);
  } catch (e) {
    return null;
  }
}

async function callEVMContract(privateKey, contractAddress, abi, methodName, params, rpcUrl) {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    const tx = await contract[methodName](...params);
    const receipt = await tx.wait();
    return receipt.hash;
  } catch (e) {
    throw new Error(`Contract call failed: ${e.message}`);
  }
}

// ─── Solana Wallet ──────────────────────────────────────
async function createSolanaWallet() {
  const keypair = Keypair.generate();
  const privateKeyBase58 = bs58.default.encode(keypair.secretKey);
  return {
    address: keypair.publicKey.toString(),
    privateKey: privateKeyBase58,
    chain: 'solana'
  };
}

async function getSolanaBalance(address, rpcUrl) {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);
    return (balance / LAMPORTS_PER_SOL).toFixed(6);
  } catch (e) {
    throw new Error(`Failed to get Solana balance: ${e.message}`);
  }
}

async function sendSolanaTokens(privateKeyBase58, toAddress, amount, rpcUrl) {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const secretKey = bs58.default.decode(privateKeyBase58);
    const fromKeypair = Keypair.fromSecretKey(secretKey);
    const toPubkey = new PublicKey(toAddress);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey,
        lamports: amount * LAMPORTS_PER_SOL
      })
    );

    const signature = await connection.sendTransaction(transaction, [fromKeypair]);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (e) {
    throw new Error(`Solana transfer failed: ${e.message}`);
  }
}

async function requestSolanaAirdrop(address, rpcUrl) {
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const pubkey = new PublicKey(address);
    const sig = await connection.requestAirdrop(pubkey, 1 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    return sig;
  } catch (e) {
    throw new Error(`Airdrop failed: ${e.message}`);
  }
}

// ─── Aptos Wallet ───────────────────────────────────────
async function createAptosWallet() {
  const account = Account.generate();
  return {
    address: account.accountAddress.toString(),
    privateKey: account.privateKey.toString(),
    chain: 'aptos'
  };
}

async function getAptosBalance(address, rpcUrl) {
  try {
    const config = new AptosConfig({ fullnode: rpcUrl });
    const aptos = new Aptos(config);
    const resources = await aptos.getAccountResources({ accountAddress: address });
    const coinResource = resources.find(r => r.type === '0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>');
    if (!coinResource) return '0';
    const balance = coinResource.data.coin.value;
    return (parseInt(balance) / 1e8).toFixed(8);
  } catch (e) {
    return '0';
  }
}

async function fundAptosTestnet(address) {
  try {
    const aptos = new Aptos(new AptosConfig({ network: Network.TESTNET }));
    await aptos.fundAccount({ accountAddress: address, amount: 100_000_000 });
    return true;
  } catch (e) {
    throw new Error(`Aptos faucet failed: ${e.message}`);
  }
}

// ─── Wallet Factory ─────────────────────────────────────
async function createWallet(chain) {
  switch (chain.toLowerCase()) {
    case 'evm':
    case 'ethereum':
    case 'bsc':
    case 'polygon':
    case 'arbitrum':
    case 'base':
    case 'optimism':
      return createEVMWallet();
    case 'solana':
      return createSolanaWallet();
    case 'aptos':
      return createAptosWallet();
    default:
      // Default to EVM for unknown chains
      return createEVMWallet();
  }
}

async function getBalance(address, chain, rpcUrl) {
  const chainLower = chain.toLowerCase();
  if (chainLower === 'solana') return getSolanaBalance(address, rpcUrl);
  if (chainLower === 'aptos') return getAptosBalance(address, rpcUrl);
  return getEVMBalance(address, rpcUrl);
}

// Prepare wallet data for storage (encrypt private key)
function prepareForStorage(walletData, name) {
  return {
    name: name || `${walletData.chain} Wallet`,
    chain: walletData.chain,
    address: walletData.address,
    encryptedKey: encrypt(walletData.privateKey),
    encryptedMnemonic: walletData.mnemonic ? encrypt(walletData.mnemonic) : null
  };
}

// Get decrypted private key
function getPrivateKey(encryptedKey) {
  return decrypt(encryptedKey);
}

module.exports = {
  createWallet,
  getBalance,
  prepareForStorage,
  getPrivateKey,
  getEVMGasPrice,
  sendEVMTokens,
  sendSolanaTokens,
  requestSolanaAirdrop,
  fundAptosTestnet,
  callEVMContract
};
