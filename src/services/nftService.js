const { ethers } = require('ethers');
const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const db = require('./database');

// ─── Standard Mint ABIs ───────────────────────────────────
const ERC721_MINT_ABI = [
  'function mint(address to) external payable',
  'function mint(uint256 quantity) external payable',
  'function mint() external payable',
  'function publicMint(uint256 quantity) external payable',
  'function publicMint() external payable',
  'function safeMint(address to) external payable',
  'function claim(uint256 quantity) external payable',
  'function claim() external payable',
  'function price() external view returns (uint256)',
  'function mintPrice() external view returns (uint256)',
  'function cost() external view returns (uint256)',
  'function totalSupply() external view returns (uint256)',
  'function maxSupply() external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function name() external view returns (string)',
  'function symbol() external view returns (string)'
];

const ERC1155_MINT_ABI = [
  'function mint(address to, uint256 id, uint256 amount, bytes memory data) external payable',
  'function mint(uint256 id, uint256 amount) external payable',
  'function mintBatch(address to, uint256[] memory ids, uint256[] memory amounts, bytes memory data) external payable',
  'function uri(uint256 id) external view returns (string)',
  'function balanceOf(address account, uint256 id) external view returns (uint256)'
];

// Common mint function signatures to try in order
const MINT_SIGNATURES = [
  { name: 'mint()', args: [], value: true },
  { name: 'mint(uint256)', args: [1], value: true },
  { name: 'publicMint()', args: [], value: true },
  { name: 'publicMint(uint256)', args: [1], value: true },
  { name: 'claim()', args: [], value: true },
  { name: 'claim(uint256)', args: [1], value: true },
  { name: 'safeMint(address)', args: ['WALLET'], value: true },
];

// ─── Save NFT Contract for future use ────────────────────
async function saveNftContract(userId, { chainId, contractAddress, name, type, abi, mintFunction, mintPrice }) {
  return db.saveNftContract(userId, {
    chain_id: chainId,
    contract_address: contractAddress,
    name: name || 'NFT Collection',
    type: type || 'ERC721',
    abi: abi || null,
    mint_function: mintFunction || null,
    mint_price: mintPrice || '0'
  });
}

async function getNftContracts(userId, chainId = null) {
  return db.getNftContracts(userId, chainId);
}

// ─── Detect mint price from contract ─────────────────────
async function detectMintPrice(contract) {
  const priceFns = ['price', 'mintPrice', 'cost', 'PRICE', 'MINT_PRICE'];
  for (const fn of priceFns) {
    try {
      const price = await contract[fn]();
      return price;
    } catch (_) {}
  }
  return 0n;
}

// ─── Try to auto-detect and call mint function ────────────
async function autoMint(contract, walletAddress, mintPrice) {
  const combined = [...ERC721_MINT_ABI, ...ERC1155_MINT_ABI];
  
  for (const sig of MINT_SIGNATURES) {
    try {
      const args = sig.args.map(a => a === 'WALLET' ? walletAddress : a);
      const opts = sig.value && mintPrice > 0n ? { value: mintPrice } : {};
      
      const tx = await contract[sig.name.split('(')[0]](...args, opts);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash };
    } catch (err) {
      // Try next signature
      continue;
    }
  }
  
  return { success: false, message: 'Could not find working mint function. Please provide the ABI.' };
}

// ─── ERC-721 Mint ─────────────────────────────────────────
async function mintERC721({ privateKey, contractAddress, quantity = 1, rpcUrl, chainId, userId, customAbi, mintFunctionName }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  // Use custom ABI if provided, else try standard
  const abi = customAbi ? JSON.parse(customAbi) : ERC721_MINT_ABI;
  const contract = new ethers.Contract(contractAddress, abi, wallet);

  try {
    // Try to get collection name for nice message
    let collectionName = contractAddress.slice(0, 10);
    try { collectionName = await contract.name(); } catch (_) {}

    // Detect price
    const mintPrice = await detectMintPrice(contract);
    const totalValue = mintPrice * BigInt(quantity);

    // Use specific function if known, else auto-detect
    let receipt;
    if (mintFunctionName) {
      const tx = await contract[mintFunctionName](quantity, { value: totalValue });
      receipt = await tx.wait();
    } else {
      const result = await autoMint(contract, wallet.address, mintPrice);
      if (!result.success) return result;
      return {
        success: true,
        txHash: result.txHash,
        message: `✅ Minted ${quantity}x "${collectionName}" NFT!\nCost: ${ethers.formatEther(totalValue)} ETH`
      };
    }

    return {
      success: true,
      txHash: receipt.hash,
      message: `✅ Minted ${quantity}x "${collectionName}" NFT!\nCost: ${ethers.formatEther(totalValue)} ETH`
    };
  } catch (err) {
    return { success: false, message: `ERC-721 mint failed: ${err.message}` };
  }
}

// ─── ERC-1155 Mint ────────────────────────────────────────
async function mintERC1155({ privateKey, contractAddress, tokenId = 0, amount = 1, rpcUrl, customAbi }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  const abi = customAbi ? JSON.parse(customAbi) : ERC1155_MINT_ABI;
  const contract = new ethers.Contract(contractAddress, abi, wallet);

  try {
    const mintPrice = await detectMintPrice(contract).catch(() => 0n);
    const totalValue = mintPrice * BigInt(amount);

    let tx;
    try {
      tx = await contract['mint(uint256,uint256)'](tokenId, amount, { value: totalValue });
    } catch (_) {
      tx = await contract['mint(address,uint256,uint256,bytes)'](wallet.address, tokenId, amount, '0x', { value: totalValue });
    }

    const receipt = await tx.wait();
    return {
      success: true,
      txHash: receipt.hash,
      message: `✅ Minted ${amount}x ERC-1155 Token ID ${tokenId}`
    };
  } catch (err) {
    return { success: false, message: `ERC-1155 mint failed: ${err.message}` };
  }
}

// ─── Solana NFT Mint (Candy Machine v3) ──────────────────
async function mintSolanaNFT({ privateKeyBase58, candyMachineId, rpcUrl }) {
  try {
    const bs58 = require('bs58');

    // Metaplex UMI-based minting via API call approach
    // Since full Metaplex SDK is heavy, we use the Candy Machine mint instruction
    const connection = new Connection(rpcUrl || 'https://api.mainnet-beta.solana.com', 'confirmed');
    const secretKey = bs58.default.decode(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);

    // For Candy Machine v3, use the Metaplex API
    const response = await fetch('https://api.metaplex.com/v1/candy-machine/mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        candyMachineId,
        minter: keypair.publicKey.toString()
      })
    }).catch(() => null);

    if (!response || !response.ok) {
      return {
        success: false,
        message: `Solana NFT minting via Candy Machine requires the @metaplex-foundation/umi library. ` +
                 `For now, please use a mint script or provide the mint transaction directly. ` +
                 `Full Metaplex support coming in V2!`
      };
    }

    const data = await response.json();
    return { success: true, txHash: data.signature, message: `✅ Solana NFT minted!` };
  } catch (err) {
    return { success: false, message: `Solana NFT mint failed: ${err.message}` };
  }
}

// ─── Domain Name Mint (ENS-style) ─────────────────────────
async function mintDomain({ privateKey, contractAddress, domainName, duration = 1, rpcUrl }) {
  const DOMAIN_ABI = [
    'function register(string calldata name, address owner, uint256 duration, bytes32 secret) external payable',
    'function makeCommitment(string calldata name, address owner, uint256 duration, bytes32 secret) external pure returns (bytes32)',
    'function commit(bytes32 commitment) external',
    'function rentPrice(string calldata name, uint256 duration) external view returns (uint256)',
    'function available(string calldata name) external view returns (bool)'
  ];

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, DOMAIN_ABI, wallet);

    const available = await contract.available(domainName).catch(() => true);
    if (!available) return { success: false, message: `Domain "${domainName}" is not available.` };

    const price = await contract.rentPrice(domainName, duration * 365 * 24 * 3600).catch(() => ethers.parseEther('0.01'));
    const secret = ethers.randomBytes(32);
    const secretHex = ethers.hexlify(secret);

    // Commit first
    const commitment = await contract.makeCommitment(domainName, wallet.address, duration * 365 * 24 * 3600, secretHex);
    const commitTx = await contract.commit(commitment);
    await commitTx.wait();

    // Wait 60s min between commit and register (ENS requirement)
    await new Promise(r => setTimeout(r, 65000));

    // Register
    const registerTx = await contract.register(domainName, wallet.address, duration * 365 * 24 * 3600, secretHex, { value: price });
    const receipt = await registerTx.wait();

    return { success: true, txHash: receipt.hash, message: `✅ Registered domain: ${domainName}` };
  } catch (err) {
    return { success: false, message: `Domain mint failed: ${err.message}` };
  }
}

// ─── Universal Mint Entry Point ───────────────────────────
async function mint({ type = 'ERC721', privateKey, contractAddress, rpcUrl, chainId, userId, options = {} }) {
  if (!contractAddress) {
    return {
      success: false,
      needsContract: true,
      message: `I need the NFT contract address to mint. Please provide it and I'll save it for future runs.`
    };
  }

  switch (type.toUpperCase()) {
    case 'ERC721':
      return mintERC721({ privateKey, contractAddress, rpcUrl, chainId, userId, ...options });
    case 'ERC1155':
      return mintERC1155({ privateKey, contractAddress, rpcUrl, ...options });
    case 'SOLANA':
      return mintSolanaNFT({ privateKeyBase58: privateKey, candyMachineId: contractAddress, rpcUrl, ...options });
    case 'DOMAIN':
      return mintDomain({ privateKey, contractAddress, rpcUrl, ...options });
    default:
      return mintERC721({ privateKey, contractAddress, rpcUrl, chainId, userId, ...options });
  }
}

module.exports = { mint, mintERC721, mintERC1155, mintSolanaNFT, mintDomain, saveNftContract, getNftContracts };
