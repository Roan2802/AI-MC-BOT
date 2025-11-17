const mineflayer = require('mineflayer');
const initCommandRouter = require('./commands/commandRouter.js');
const { setupPathfinder } = require('./src/movement.js');
const { initCombatSystem } = require('./src/combat.js');

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
});

bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  console.log(`[Chat] ${username}: ${message}`);
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
