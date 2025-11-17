#!/usr/bin/env node
/**
 * Test the command router and !chop command processing
 * Simulates chat commands without needing a full Minecraft server
 */

console.log('[Command Test] Starting command router test...');

// Mock bot object with EventEmitter
const EventEmitter = require('events');
class MockBot extends EventEmitter {
  constructor() {
    super();
    this.username = 'TestBot';
    this._debug = true;
  }

  chat(message) {
    console.log(`[Mock Bot Chat] ${message}`);
  }
}

const mockBot = new MockBot();

// Mock the harvestWood function
const mockHarvestWood = async (bot, radius, maxBlocks, options) => {
  console.log(`[Mock harvestWood] Called with radius=${radius}, maxBlocks=${maxBlocks}`);
  bot.chat('🌲 Starting wood harvesting...');
  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 1000));
  const harvested = Math.floor(Math.random() * 10) + 1;
  bot.chat(`✅ Harvested ${harvested} logs`);
  return harvested;
};

// Load and test the command router
try {
  // Temporarily replace the harvestWood import in the command router
  const Module = require('module');
  const originalRequire = Module.prototype.require;

  Module.prototype.require = function(id) {
    if (id === './src/wood.js') {
      return { harvestWood: mockHarvestWood };
    }
    return originalRequire.apply(this, arguments);
  };

  const initCommandRouter = require('./commands/commandRouter.js');

  console.log('[Command Test] Loaded command router');

  // Initialize the command router with mock bot
  initCommandRouter(mockBot);
  console.log('[Command Test] Command router initialized');

  // Simulate chat commands
  const testCommands = [
    '!chop',
    '!chop 10',
    '!chop 20 15',
    '!status',
    'hello bot'
  ];

  console.log('[Command Test] Testing commands...');

  // Simulate the chat event for each command
  testCommands.forEach((command, index) => {
    setTimeout(() => {
      console.log(`\n[Command Test] Sending command: ${command}`);
      // Simulate chat event
      mockBot.emit('chat', 'TestUser', command);
    }, index * 2000); // Space out commands
  });

  // Keep the process alive to see results
  setTimeout(() => {
    console.log('\n[Command Test] ✅ Command router test completed!');
    process.exit(0);
  }, testCommands.length * 2000 + 1000);

} catch (error) {
  console.error('[Command Test] ❌ Failed:', error.message);
  console.error('[Command Test] Stack:', error.stack);
}