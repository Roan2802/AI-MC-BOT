const mineflayer = require('mineflayer');
const initCommandRouter = require('./commands/commandRouter.js');
const { setupPathfinder } = require('./src/movement.js');
const { initCombatSystem } = require('./src/combat.js');

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT] Uncaught exception:', err.message);
  console.error('[UNCAUGHT] Stack:', err.stack);
  // Don't exit - let bot continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[REJECTION] Unhandled rejection at promise:', promise);
  console.error('[REJECTION] Reason:', reason);
  if (reason && reason.message) {
    console.error('[REJECTION] Message:', reason.message);
  }
  // Don't exit - let bot continue
});

console.log('[Agent01] Starting bot...');
console.log('[Agent01] Attempting to connect to localhost:25565');

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'Agent01',
  version: false, // auto-detect
  connectTimeout: 10000 // 10 seconds timeout
});

// Connection timeout fallback
const connectionTimeout = setTimeout(() => {
  console.error('[Agent01] Connection timeout! No response from server after 10 seconds.');
  console.error('[Agent01] Please ensure a Minecraft server is running on localhost:25565');
  process.exit(1);
}, 12000);

bot.once('login', () => {
  clearTimeout(connectionTimeout);
  console.log('[Agent01] Successfully logged in!');
});

bot.on('spawn', () => {
  console.log('[Agent01] Bot spawned!');
  // Setup pathfinder for movement commands
  try {
    setupPathfinder(bot);
    console.log('[Agent01] Pathfinder initialized successfully');
  } catch (e) {
    console.error('[Agent01] Pathfinder setup failed:', e);
  }
  // Combat system direct initialiseren
  const combatConfig = {
    detectionRadius: 12,
    priorityRadius: 6,
    maxHuntDistance: 14,
    followDistance: 2,
    creeperEvadeRadius: 6,
    ownerSafeHealth: 12,
    resumeFollowMs: 1200,
    enablePvpDefense: true
  };
  bot._combatSystem = initCombatSystem(bot, combatConfig);
  bot.chat('Hallo! Ik ben online.');
  // Initialize command router
  try {
    initCommandRouter(bot);
    console.log('[Agent01] Command router initialized.');
  } catch (e) {
    console.error('[Agent01] Failed to init command router:', e);
  }
  
  // Send periodic status messages to confirm connection
  setInterval(() => {
    try {
      bot.chat('Bot is actief - test');
    } catch (e) {
      console.log('[Agent01] Could not send status message:', e.message);
    }
  }, 30000); // Every 30 seconds
});

bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  console.log(`[Chat] RECEIVED: ${username}: ${message}`);
});

bot.on('error', (err) => {
  clearTimeout(connectionTimeout);
  console.error('[Error] Full error:', err);
  console.error('[Error] Error code:', err.code);
  console.error('[Error] Error message:', err.message);
  console.error('[Error] Stack:', err.stack);
  if (err.code === 'ECONNREFUSED') {
    console.error('[Agent01] Cannot connect to server. Is it running?');
    process.exit(1);
  }
});

bot.on('end', () => {
  clearTimeout(connectionTimeout);
  console.log('[Agent01] Disconnected');
});
