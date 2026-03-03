const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Primary model for complex tasks
const mainModel = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
});

// Fast model for simple classification
const fastModel = genAI.getGenerativeModel({
  model: 'gemini-1.5-flash',
  generationConfig: { temperature: 0.1, maxOutputTokens: 20 }
});

const SYSTEM_PROMPT = 'You are an AI assistant for a blockchain automation Telegram bot. ' +
  'You help users manage crypto wallets, interact with blockchains, and automate tasks. ' +
  'Always respond in a friendly, clear tone. Use emojis sparingly but appropriately. ' +
  'When extracting task info from announcements, return valid JSON. ' +
  'When explaining errors, be simple and suggest a fix.';

// ─── Helper to call Gemini safely ────────────────────────
async function callGemini(model, prompt, retries) {
  const attempts = retries || 2;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(function(r) { setTimeout(r, 1000); });
    }
  }
}

// ─── General AI conversation ──────────────────────────────
async function askAI(userMessage, conversationHistory) {
  const history = conversationHistory || [];
  const context = history.slice(-6).map(function(h) {
    return h.role + ': ' + h.content;
  }).join('\n');

  const prompt = SYSTEM_PROMPT + '\n\n' +
    (context ? 'Recent conversation:\n' + context + '\n\n' : '') +
    'User: ' + userMessage;

  return callGemini(mainModel, prompt);
}

// ─── Extract task info from announcement ─────────────────
async function extractTaskFromAnnouncement(text) {
  const prompt = 'Extract blockchain task information from this announcement. ' +
    'Return ONLY a valid JSON object, no other text, no markdown backticks.\n\n' +
    'Announcement:\n' + text + '\n\n' +
    'Return JSON with these fields:\n' +
    '{\n' +
    '  "type": "task_extraction",\n' +
    '  "projectName": "string",\n' +
    '  "network": {\n' +
    '    "name": "string",\n' +
    '    "chainId": "string or null",\n' +
    '    "rpcUrl": "string or null",\n' +
    '    "symbol": "string or null",\n' +
    '    "decimals": 18,\n' +
    '    "explorerUrl": "string or null",\n' +
    '    "isTestnet": true or false\n' +
    '  },\n' +
    '  "registrationUrl": "string or null",\n' +
    '  "tasks": ["task1", "task2"],\n' +
    '  "links": {}\n' +
    '}';

  try {
    const raw = await callGemini(mainModel, prompt);
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

// ─── Explain error in simple terms ───────────────────────
async function explainError(error, context) {
  const prompt = 'A user blockchain bot got this error while doing "' + context + '":\n\n' +
    'Error: ' + error + '\n\n' +
    'Explain this in 1-2 simple sentences a non-technical person can understand, ' +
    'and suggest what they should do to fix it.';

  try {
    return await callGemini(mainModel, prompt);
  } catch (e) {
    return 'Something went wrong. Please check your wallet balance and try again.';
  }
}

// ─── Generate a crypto story ──────────────────────────────
async function generateStory() {
  const themes = [
    'a crypto explorer discovering a new blockchain kingdom',
    'a DeFi wizard learning to cast yield farming spells',
    'a wallet detective solving the mystery of the missing tokens',
    'an NFT artist in a digital world where art comes alive',
    'a gas price trader navigating the volatile blockchain seas'
  ];
  const theme = themes[Math.floor(Math.random() * themes.length)];

  const prompt = 'Write a short fun 3-paragraph story about ' + theme + '. ' +
    'Make it entertaining and crypto-themed. Keep it under 200 words.';

  try {
    return await callGemini(mainModel, prompt);
  } catch (e) {
    return 'Once upon a time in the blockchain kingdom, a brave wallet explorer set out to find the legendary zero-fee transaction...';
  }
}

// ─── Classify user intent ─────────────────────────────────
async function classifyIntent(message) {
  const prompt = 'Classify this user message into exactly one of these intents. ' +
    'Reply with ONLY the intent name, nothing else:\n\n' +
    'create_wallet - user wants to create or generate a wallet\n' +
    'view_wallets - user wants to see their wallets\n' +
    'import_wallet - user wants to import a wallet via private key or seed phrase\n' +
    'check_balance - user wants to check balance\n' +
    'send_tokens - user wants to send or transfer tokens\n' +
    'swap_tokens - user wants to swap one token for another on a DEX\n' +
    'add_dex - user wants to add a custom DEX router address\n' +
    'mint_nft - user wants to mint an NFT or domain name\n' +
    'add_nft_contract - user wants to save an NFT contract address\n' +
    'cascade_fund - user wants to fund multiple wallets from one master wallet\n' +
    'add_chain - user wants to add a custom blockchain network\n' +
    'view_chains - user wants to see saved chains or DEXes\n' +
    'save_task - user wants to save or create an automation task\n' +
    'view_tasks - user wants to see their saved tasks\n' +
    'run_task - user wants to run or execute a task\n' +
    'check_gas - user wants to check gas prices\n' +
    'task_extraction - message contains a blockchain project announcement with RPC details and tasks\n' +
    'help - user needs help or asks what the bot can do\n' +
    'story - user wants a story or entertainment\n' +
    'history - user wants to see task history\n' +
    'general - general conversation\n\n' +
    'Message: "' + message + '"';

  try {
    const result = await callGemini(fastModel, prompt);
    return result.trim().toLowerCase().split('\n')[0].trim();
  } catch (e) {
    return 'general';
  }
}

// ─── Extract swap parameters ──────────────────────────────
async function extractSwapParamsFromText(text) {
  const prompt = 'Extract swap parameters from this text. ' +
    'Return ONLY valid JSON, no markdown, no backticks.\n\n' +
    'Text: "' + text + '"\n\n' +
    'Return: {"fromToken": "native or token address", "toToken": "native or token address", ' +
    '"amount": number, "slippage": number, "chain": "evm or solana or aptos"}\n' +
    'Use "native" for ETH/BNB/SOL/MATIC. Default slippage is 1. Default chain is evm.';

  try {
    const raw = await callGemini(fastModel, prompt);
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return null;
  }
}

// ─── Extract mint parameters ──────────────────────────────
async function extractMintParamsFromText(text) {
  const prompt = 'Extract NFT mint parameters from this text. ' +
    'Return ONLY valid JSON, no markdown, no backticks.\n\n' +
    'Text: "' + text + '"\n\n' +
    'Return: {"contractAddress": "0x... or null", "type": "ERC721 or ERC1155 or SOLANA or DOMAIN", ' +
    '"quantity": number, "tokenId": number, "domainName": "name or null"}';

  try {
    const raw = await callGemini(fastModel, prompt);
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return null;
  }
}

// ─── Extract funding parameters ───────────────────────────
async function extractFundingParamsFromText(text) {
  const prompt = 'Extract cascade funding parameters from this text. ' +
    'Return ONLY valid JSON, no markdown, no backticks.\n\n' +
    'Text: "' + text + '"\n\n' +
    'Return: {"mode": "equal or fixed or gas_only", "amountPerWallet": number or null, ' +
    '"totalAmount": number or null, "masterAddress": "0x... or wallet number like 1 or null"}';

  try {
    const raw = await callGemini(fastModel, prompt);
    return JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch (e) {
    return null;
  }
}

module.exports = {
  askAI,
  extractTaskFromAnnouncement,
  explainError,
  generateStory,
  classifyIntent,
  extractSwapParamsFromText,
  extractMintParamsFromText,
  extractFundingParamsFromText
};
