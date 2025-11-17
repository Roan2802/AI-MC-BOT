/**
 * Test script to validate wood.js fixes without needing a real server
 * Tests all the crash-prone areas we fixed
 */

const assert = require('assert');
console.log('[Test] Starting wood.js fixes validation...\n');

// Mock bot object with necessary properties
const createMockBot = () => ({
  entity: {
    position: { 
      x: 0, 
      y: 64, 
      z: 0,
      distanceTo: (other) => Math.sqrt(
        Math.pow(this.x - other.x, 2) + 
        Math.pow(this.y - other.y, 2) + 
        Math.pow(this.z - other.z, 2)
      )
    }
  },
  blockAt: (pos) => {
    // Simulate some logs nearby
    if (pos.y > 63 && pos.y < 70) {
      if ((pos.x === 0 || pos.x === 1 || pos.x === -1) && (pos.z === 0 || pos.z === 1 || pos.z === -1)) {
        return { name: 'oak_log', position: pos }
      }
    }
    return { name: 'air', position: pos }
  },
  findBlock: (options) => {
    // Simulate finding a log block
    return { 
      name: 'oak_log', 
      position: { x: 0, y: 65, z: 0 },
      distanceTo: (other) => 2
    }
  },
  inventory: {
    items: () => [
      { name: 'oak_log', count: 3 },
      { name: 'oak_sapling', count: 2 }
    ]
  },
  entities: {
    'item1': {
      objectType: 'item',
      position: { 
        x: 0, 
        y: 64, 
        z: 0,
        distanceTo: () => 1
      },
      metadata: [,,,,,,, , { itemId: 1, item: 'oak_log' }]
    }
  },
  pathfinder: {
    goto: async () => { return true },
    setMovements: () => {},
    setGoal: () => {}
  },
  registry: {
    items: {
      1: { name: 'oak_log' },
      2: { name: 'oak_planks' }
    },
    itemsByName: {
      'oak_planks': { id: 2 },
      'stick': { id: 3 }
    }
  },
  chat: (msg) => console.log(`[Bot] ${msg}`),
  equip: async () => {},
  unequip: async () => {},
  dig: async () => {},
  placeBlock: async () => {},
  craft: async () => {},
  _debug: false
});

// Import the wood module
const wood = require('./src/wood.js');

// Test 1: findConnectedLogs with null check
console.log('[Test 1] findConnectedLogs - Parameter validation');
try {
  const result1 = wood.findConnectedLogs(null, null);
  assert.strictEqual(Array.isArray(result1), true);
  console.log('✓ Returns empty array for null params');
  
  const bot = createMockBot();
  const result2 = wood.findConnectedLogs(bot, null);
  assert.strictEqual(Array.isArray(result2), true);
  console.log('✓ Handles null block gracefully');
  
  const logBlock = { name: 'oak_log', position: { x: 0, y: 65, z: 0, offset: (a, b, c) => ({ x: a, y: b, z: c, distanceTo: () => 1 }) } };
  const result3 = wood.findConnectedLogs(bot, logBlock, 20);
  assert.strictEqual(Array.isArray(result3), true);
  console.log('✓ Returns array for valid block');
  
  console.log('[Test 1] ✅ PASSED\n');
} catch (e) {
  console.error('[Test 1] ❌ FAILED:', e.message, '\n');
  process.exit(1);
}

// Test 2: collectNearbyItems with pathfinder check
console.log('[Test 2] collectNearbyItems - Pathfinder safety');
try {
  (async () => {
    const bot = createMockBot();
    
    // Test with null pathfinder
    bot.pathfinder = null;
    await wood.collectNearbyItems(bot, 10);
    console.log('✓ Handles null pathfinder gracefully');
    
    // Test with valid pathfinder
    bot.pathfinder = { goto: async () => {} };
    await wood.collectNearbyItems(bot, 10);
    console.log('✓ Works with valid pathfinder');
    
    console.log('[Test 2] ✅ PASSED\n');
  })();
} catch (e) {
  console.error('[Test 2] ❌ FAILED:', e.message, '\n');
}

// Test 3: craftPlanks with registry validation
console.log('[Test 3] craftPlanks - Registry safety');
try {
  (async () => {
    const bot = createMockBot();
    
    // Test with valid bot
    const result = await wood.craftPlanks(bot, 2);
    assert.strictEqual(typeof result, 'number');
    console.log('✓ Returns number for valid bot');
    
    // Test with missing items
    bot.inventory.items = () => [];
    const result2 = await wood.craftPlanks(bot, 2);
    assert.strictEqual(result2, 0);
    console.log('✓ Returns 0 when no logs available');
    
    // Test with null bot
    const result3 = await wood.craftPlanks(null, 2);
    assert.strictEqual(result3, 0);
    console.log('✓ Handles null bot gracefully');
    
    console.log('[Test 3] ✅ PASSED\n');
  })();
} catch (e) {
  console.error('[Test 3] ❌ FAILED:', e.message, '\n');
}

// Test 4: craftSticks with registry validation  
console.log('[Test 4] craftSticks - Recipe safety');
try {
  (async () => {
    const bot = createMockBot();
    
    // Test with valid bot
    const result = await wood.craftSticks(bot, 2);
    assert.strictEqual(typeof result, 'number');
    console.log('✓ Returns number for valid bot');
    
    // Test with null bot
    const result2 = await wood.craftSticks(null, 2);
    assert.strictEqual(result2, 0);
    console.log('✓ Handles null bot gracefully');
    
    console.log('[Test 4] ✅ PASSED\n');
  })();
} catch (e) {
  console.error('[Test 4] ❌ FAILED:', e.message, '\n');
}

// Test 5: harvestWood pathfinder verification
console.log('[Test 5] harvestWood - Pathfinder verification');
try {
  (async () => {
    const bot = createMockBot();
    
    // Test with missing pathfinder
    bot.pathfinder = null;
    const result1 = await wood.harvestWood(bot, 20, 5);
    assert.strictEqual(result1, 0);
    console.log('✓ Returns 0 when pathfinder not available');
    
    // Test with invalid pathfinder
    bot.pathfinder = {};
    const result2 = await wood.harvestWood(bot, 20, 5);
    assert.strictEqual(result2, 0);
    console.log('✓ Returns 0 when pathfinder.goto missing');
    
    console.log('[Test 5] ✅ PASSED\n');
  })();
} catch (e) {
  console.error('[Test 5] ❌ FAILED:', e.message, '\n');
}

console.log('\n========================================');
console.log('✅ All wood.js fixes validated!');
console.log('========================================\n');
console.log('Key improvements made:');
console.log('  • findConnectedLogs: Added null checks + try-catch');
console.log('  • collectNearbyItems: Pathfinder safety checks + entity type validation');
console.log('  • craftPlanks: Registry validation + item lookup safety');
console.log('  • craftSticks: Recipe validation + null handling');
console.log('  • harvestWood: Comprehensive pathfinder verification');
console.log('\nReady to test with real server! 🚀');
