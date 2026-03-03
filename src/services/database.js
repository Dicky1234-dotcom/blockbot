const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ─── Users ─────────────────────────────────────────────
async function ensureUser(userId, username) {
  const { data, error } = await supabase
    .from('users')
    .upsert({ id: userId, username }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Wallets ────────────────────────────────────────────
async function saveWallet(userId, { name, chain, address, encryptedKey, encryptedMnemonic }) {
  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      name,
      chain,
      address,
      encrypted_private_key: encryptedKey,
      mnemonic_encrypted: encryptedMnemonic
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getUserWallets(userId, chain = null) {
  let query = supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (chain) query = query.eq('chain', chain);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getWalletByAddress(userId, address) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('address', address)
    .single();
  if (error) return null;
  return data;
}

async function deleteWallet(userId, walletId) {
  const { error } = await supabase
    .from('wallets')
    .delete()
    .eq('id', walletId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Custom Chains ──────────────────────────────────────
async function saveCustomChain(userId, chainData) {
  const { data, error } = await supabase
    .from('custom_chains')
    .insert({ user_id: userId, ...chainData })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getUserChains(userId) {
  const { data, error } = await supabase
    .from('custom_chains')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function deleteCustomChain(userId, chainId) {
  const { error } = await supabase
    .from('custom_chains')
    .delete()
    .eq('id', chainId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Task Sets ──────────────────────────────────────────
async function saveTaskSet(userId, taskSetData) {
  const { data, error } = await supabase
    .from('task_sets')
    .insert({ user_id: userId, ...taskSetData })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getUserTaskSets(userId) {
  const { data, error } = await supabase
    .from('task_sets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function updateTaskSet(taskSetId, updates) {
  const { data, error } = await supabase
    .from('task_sets')
    .update(updates)
    .eq('id', taskSetId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getActiveDueTaskSets() {
  const { data, error } = await supabase
    .from('task_sets')
    .select('*')
    .eq('is_active', true)
    .not('repeat_schedule', 'eq', 'none')
    .lte('next_run', new Date().toISOString());
  if (error) throw error;
  return data || [];
}

async function deleteTaskSet(userId, taskSetId) {
  const { error } = await supabase
    .from('task_sets')
    .delete()
    .eq('id', taskSetId)
    .eq('user_id', userId);
  if (error) throw error;
}

// ─── Task History ───────────────────────────────────────
async function logTaskHistory(userId, historyData) {
  const { data, error } = await supabase
    .from('task_history')
    .insert({ user_id: userId, ...historyData })
    .select()
    .single();
  if (error) console.error('History log error:', error);
  return data;
}

async function getUserTaskHistory(userId, limit = 20) {
  const { data, error } = await supabase
    .from('task_history')
    .select('*')
    .eq('user_id', userId)
    .order('executed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ─── Custom DEXes ────────────────────────────────────────
async function saveCustomDex(userId, dexData) {
  const { data, error } = await supabase
    .from('custom_dexes')
    .upsert({ user_id: userId, ...dexData }, { onConflict: 'user_id,chain_id' })
    .select().single();
  if (error) throw error;
  return data;
}

async function getCustomDex(userId, chainId) {
  const { data } = await supabase
    .from('custom_dexes')
    .select('*')
    .eq('user_id', userId)
    .eq('chain_id', chainId)
    .single();
  return data;
}

async function getUserDexes(userId) {
  const { data } = await supabase
    .from('custom_dexes')
    .select('*')
    .eq('user_id', userId);
  return data || [];
}

// ─── NFT Contracts ────────────────────────────────────────
async function saveNftContract(userId, contractData) {
  const { data, error } = await supabase
    .from('nft_contracts')
    .upsert({ user_id: userId, ...contractData }, { onConflict: 'user_id,contract_address,chain_id' })
    .select().single();
  if (error) throw error;
  return data;
}

async function getNftContracts(userId, chainId = null) {
  let query = supabase.from('nft_contracts').select('*').eq('user_id', userId);
  if (chainId) query = query.eq('chain_id', chainId);
  const { data } = await query;
  return data || [];
}

async function getNftContractByAddress(userId, contractAddress) {
  const { data } = await supabase
    .from('nft_contracts')
    .select('*')
    .eq('user_id', userId)
    .eq('contract_address', contractAddress)
    .single();
  return data;
}

module.exports = {
  ensureUser,
  saveWallet, getUserWallets, getWalletByAddress, deleteWallet,
  saveCustomChain, getUserChains, deleteCustomChain,
  saveTaskSet, getUserTaskSets, updateTaskSet, getActiveDueTaskSets, deleteTaskSet,
  logTaskHistory, getUserTaskHistory,
  saveCustomDex, getCustomDex, getUserDexes,
  saveNftContract, getNftContracts, getNftContractByAddress
};
