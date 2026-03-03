-- Run this SQL in your Supabase SQL editor to set up the database

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  username TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  name TEXT,
  chain TEXT NOT NULL, -- 'evm', 'solana', 'aptos'
  address TEXT NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  mnemonic_encrypted TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Custom chains table
CREATE TABLE IF NOT EXISTS custom_chains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  name TEXT NOT NULL,
  chain_id TEXT,
  rpc_url TEXT NOT NULL,
  currency_symbol TEXT,
  decimals INTEGER DEFAULT 18,
  explorer_url TEXT,
  is_testnet BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task sets table (saved automation tasks)
CREATE TABLE IF NOT EXISTS task_sets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  chain_info JSONB,
  tasks JSONB NOT NULL,
  repeat_schedule TEXT, -- cron expression or 'daily', 'none'
  is_active BOOLEAN DEFAULT TRUE,
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Task history table
CREATE TABLE IF NOT EXISTS task_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  task_set_id UUID REFERENCES task_sets(id),
  wallet_address TEXT,
  task_name TEXT,
  status TEXT, -- 'success', 'failed', 'skipped'
  result TEXT,
  error TEXT,
  tx_hash TEXT,
  executed_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_task_sets_user_id ON task_sets(user_id);
CREATE INDEX IF NOT EXISTS idx_task_history_user_id ON task_history(user_id);
CREATE INDEX IF NOT EXISTS idx_task_sets_next_run ON task_sets(next_run) WHERE is_active = TRUE;

-- Custom DEXes table (user-added DEX routers for any chain)
CREATE TABLE IF NOT EXISTS custom_dexes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  name TEXT NOT NULL,
  chain_id TEXT NOT NULL,
  router_address TEXT NOT NULL,
  weth_address TEXT,
  abi TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, chain_id)
);

-- NFT contracts table (saved for minting)
CREATE TABLE IF NOT EXISTS nft_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  chain_id TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  name TEXT,
  type TEXT DEFAULT 'ERC721',
  abi TEXT,
  mint_function TEXT,
  mint_price TEXT DEFAULT '0',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, contract_address, chain_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_dexes_user_id ON custom_dexes(user_id);
CREATE INDEX IF NOT EXISTS idx_nft_contracts_user_id ON nft_contracts(user_id);
