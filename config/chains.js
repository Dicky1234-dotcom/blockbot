const DEFAULT_CHAINS = {
  // EVM Mainnets
  ethereum: {
    name: 'Ethereum Mainnet',
    chainId: '1',
    rpcUrl: 'https://eth.llamarpc.com',
    symbol: 'ETH',
    decimals: 18,
    explorer: 'https://etherscan.io',
    isTestnet: false,
    type: 'evm'
  },
  bsc: {
    name: 'BNB Smart Chain',
    chainId: '56',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    symbol: 'BNB',
    decimals: 18,
    explorer: 'https://bscscan.com',
    isTestnet: false,
    type: 'evm'
  },
  polygon: {
    name: 'Polygon',
    chainId: '137',
    rpcUrl: 'https://polygon.llamarpc.com',
    symbol: 'MATIC',
    decimals: 18,
    explorer: 'https://polygonscan.com',
    isTestnet: false,
    type: 'evm'
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: '42161',
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    symbol: 'ETH',
    decimals: 18,
    explorer: 'https://arbiscan.io',
    isTestnet: false,
    type: 'evm'
  },
  base: {
    name: 'Base',
    chainId: '8453',
    rpcUrl: 'https://mainnet.base.org',
    symbol: 'ETH',
    decimals: 18,
    explorer: 'https://basescan.org',
    isTestnet: false,
    type: 'evm'
  },
  optimism: {
    name: 'Optimism',
    chainId: '10',
    rpcUrl: 'https://mainnet.optimism.io',
    symbol: 'ETH',
    decimals: 18,
    explorer: 'https://optimistic.etherscan.io',
    isTestnet: false,
    type: 'evm'
  },

  // EVM Testnets
  sepolia: {
    name: 'Sepolia Testnet',
    chainId: '11155111',
    rpcUrl: 'https://rpc.sepolia.org',
    symbol: 'ETH',
    decimals: 18,
    explorer: 'https://sepolia.etherscan.io',
    isTestnet: true,
    type: 'evm'
  },
  bscTestnet: {
    name: 'BSC Testnet',
    chainId: '97',
    rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    symbol: 'tBNB',
    decimals: 18,
    explorer: 'https://testnet.bscscan.com',
    isTestnet: true,
    type: 'evm'
  },
  mumbai: {
    name: 'Polygon Mumbai',
    chainId: '80001',
    rpcUrl: 'https://rpc-mumbai.maticvigil.com',
    symbol: 'MATIC',
    decimals: 18,
    explorer: 'https://mumbai.polygonscan.com',
    isTestnet: true,
    type: 'evm'
  },

  // Solana
  solanaMainnet: {
    name: 'Solana Mainnet',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    symbol: 'SOL',
    decimals: 9,
    explorer: 'https://solscan.io',
    isTestnet: false,
    type: 'solana'
  },
  solanaDevnet: {
    name: 'Solana Devnet',
    rpcUrl: 'https://api.devnet.solana.com',
    symbol: 'SOL',
    decimals: 9,
    explorer: 'https://solscan.io/?cluster=devnet',
    isTestnet: true,
    type: 'solana'
  },

  // Aptos
  aptosMainnet: {
    name: 'Aptos Mainnet',
    rpcUrl: 'https://fullnode.mainnet.aptoslabs.com/v1',
    symbol: 'APT',
    decimals: 8,
    explorer: 'https://explorer.aptoslabs.com',
    isTestnet: false,
    type: 'aptos'
  },
  aptosTestnet: {
    name: 'Aptos Testnet',
    rpcUrl: 'https://fullnode.testnet.aptoslabs.com/v1',
    symbol: 'APT',
    decimals: 8,
    explorer: 'https://explorer.aptoslabs.com?network=testnet',
    isTestnet: true,
    type: 'aptos'
  }
};

module.exports = { DEFAULT_CHAINS };
