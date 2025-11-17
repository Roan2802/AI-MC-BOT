#!/usr/bin/env node
/**
 * Comprehensive test suite for all core functionality.
 * Tests: safety, combat, commands, imports/exports.
 */

const assert = require('assert');
const safety = require('../utils/safety.js');
const combat = require('../src/combat.js');
const combatEnhanced = require('../src/combatEnhanced.js');
const movement = require('../src/movement.js');
const mining = require('../src/mining.js');
const crafting = require('../src/crafting.js');
const memory = require('../src/memory.js');
const navigation = require('../src/navigation.js');
const storage = require('../src/storage.js');
const smelting = require('../src/smelting.js');
const wood = require('../src/wood.js');
const automation = require('../src/automation.js');
const builtin = require('../commands/builtinCommands.js');
const initCommandRouter = require('../commands/commandRouter.js');

let testCount = 0
let passCount = 0
let failCount = 0

function test(name, fn) {
  testCount++
  try {
    fn()
    passCount++
    console.log(`✅ ${name}`)
  } catch (e) {
    failCount++
    console.error(`❌ ${name}: ${e.message}`)
  }
}

console.log('=== COMPREHENSIVE TEST SUITE ===\n')

// --- SAFETY TESTS ---
console.log('--- Safety Module Tests ---')

test('isBlockSafe rejects lava', () => {
  const result = safety.isBlockSafe(null, { name: 'lava' })
  assert.strictEqual(result, false)
})

test('isBlockSafe rejects fire', () => {
  const result = safety.isBlockSafe(null, { name: 'fire' })
  assert.strictEqual(result, false)
})

test('isBlockSafe accepts grass', () => {
  const result = safety.isBlockSafe(null, { name: 'grass_block' })
  assert.strictEqual(result, true)
})

test('isBlockSafe handles null block', () => {
  const result = safety.isBlockSafe(null, null)
  assert.strictEqual(result, false)
})

test('isLavaNearby detects lava within radius', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.x === 1 && pos.y === 0 && pos.z === 0) return { name: 'lava' }
      return { name: 'air' }
    }
  }
  const result = safety.isLavaNearby(fakeBot, { x: 0, y: 0, z: 0 }, 2)
  assert.strictEqual(result, true)
})

test('isLavaNearby returns false when no lava', () => {
  const fakeBot = {
    blockAt: (pos) => ({ name: 'air' })
  }
  const result = safety.isLavaNearby(fakeBot, { x: 0, y: 0, z: 0 }, 2)
  assert.strictEqual(result, false)
})

test('isFireNearby detects fire within radius', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.x === 1 && pos.y === 0 && pos.z === 0) return { name: 'fire' }
      return { name: 'air' }
    }
  }
  const result = safety.isFireNearby(fakeBot, { x: 0, y: 0, z: 0 }, 2)
  assert.strictEqual(result, true)
})

test('isDeepDrop detects fall distance', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.y < 20) return { name: 'air' }
      return { name: 'stone' }
    }
  }
  const result = safety.isDeepDrop(fakeBot, { x: 0, y: 20, z: 0 }, 4)
  assert.strictEqual(result, true)
})

test('isDeepDrop returns false when below threshold', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.y >= 19) return { name: 'stone' }
      return { name: 'air' }
    }
  }
  const result = safety.isDeepDrop(fakeBot, { x: 0, y: 22, z: 0 }, 4)
  assert.strictEqual(result, false)
})

test('findNearbySafePosition returns safe spot', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.y < 0) return { name: 'air' }
      return { name: 'grass_block' }
    }
  }
  const result = safety.findNearbySafePosition(fakeBot, { x: 0, y: 0, z: 0 }, 5)
  assert.ok(result && typeof result.x === 'number' && typeof result.y === 'number')
})

test('findNearbySafePosition returns null when no safe spot', () => {
  const fakeBot = {
    blockAt: (pos) => ({ name: 'lava' })
  }
  const result = safety.findNearbySafePosition(fakeBot, { x: 0, y: 0, z: 0 }, 1)
  assert.strictEqual(result, null)
})

// --- COMBAT TESTS ---
console.log('\n--- Combat Module Tests ---')

test('protectPlayer sets target', () => {
  const fakeBot = {}
  const result = combat.protectPlayer(fakeBot, 'TestPlayer')
  assert.strictEqual(result, true)
  assert.strictEqual(fakeBot._protectTarget, 'TestPlayer')
})

test('protectPlayer with empty name returns false', () => {
  const fakeBot = {}
  const result = combat.protectPlayer(fakeBot, '')
  assert.strictEqual(result, false)
})

test('stopProtect clears target', () => {
  const fakeBot = { _protectTarget: 'TestPlayer' }
  combat.stopProtect(fakeBot)
  assert.strictEqual(fakeBot._protectTarget, undefined)
})

test('enhancedAttack calls bot.attack fallback', () => {
  let attackCalled = false
  const fakeBot = {
    attack: (ent) => { attackCalled = true }
  }
  const result = combatEnhanced.enhancedAttack(fakeBot, { name: 'zombie' })
  assert.strictEqual(result, true)
  assert.strictEqual(attackCalled, true)
})

test('enhancedAttack returns false for null entity', () => {
  const fakeBot = { attack: () => {} }
  const result = combatEnhanced.enhancedAttack(fakeBot, null)
  assert.strictEqual(result, false)
})

// --- COMMAND TESTS ---
console.log('\n--- Command Module Tests ---')

test('builtin.hello command exists', () => {
  assert.strictEqual(typeof builtin.hello, 'function')
})

test('builtin.status command exists', () => {
  assert.strictEqual(typeof builtin.status, 'function')
})

test('builtin.protect command exists', () => {
  assert.strictEqual(typeof builtin.protect, 'function')
})

test('builtin.debug command exists', () => {
  assert.strictEqual(typeof builtin.debug, 'function')
})

test('builtin.help command exists', () => {
  assert.strictEqual(typeof builtin.help, 'function')
})

// --- IMPORTS TESTS ---
console.log('\n--- Import/Export Tests ---')

test('safety exports required functions', () => {
  assert.strictEqual(typeof safety.isBlockSafe, 'function')
  assert.strictEqual(typeof safety.isPositionSafe, 'function')
  assert.strictEqual(typeof safety.isLavaNearby, 'function')
  assert.strictEqual(typeof safety.isFireNearby, 'function')
  assert.strictEqual(typeof safety.isDeepDrop, 'function')
  assert.strictEqual(typeof safety.findNearbySafePosition, 'function')
})

test('combat exports required functions', () => {
  assert.strictEqual(typeof combat.startCombatMonitor, 'function')
  assert.strictEqual(typeof combat.stopCombatMonitor, 'function')
  assert.strictEqual(typeof combat.protectPlayer, 'function')
  assert.strictEqual(typeof combat.stopProtect, 'function')
})

test('combatEnhanced exports required functions', () => {
  assert.strictEqual(typeof combatEnhanced.tryInitEnhanced, 'function')
  assert.strictEqual(typeof combatEnhanced.enhancedAttack, 'function')
  assert.strictEqual(typeof combatEnhanced.enableAutoEat, 'function')
  assert.strictEqual(typeof combatEnhanced.disableAutoEat, 'function')
})

test('automation exports required functions', () => {
  assert.strictEqual(typeof automation.createDefaultEngine, 'function')
  assert.strictEqual(typeof automation.isResourceDepleted, 'function')
  assert.strictEqual(typeof automation.getInventoryStatus, 'function')
})

test('builtin exports all commands as object', () => {
  assert.ok(typeof builtin === 'object')
  assert.ok(Object.keys(builtin).length > 5)
})

// --- ROUTER TESTS ---
console.log('\n--- Command Router Tests ---')

test('initCommandRouter init guard prevents duplicate registration', () => {
  let onCount = 0
  const fakeBot = {
    on: (evt, fn) => { if (evt === 'chat') onCount++ },
    pathfinder: null,
    players: {},
    _debug: false
  }
  initCommandRouter(fakeBot)
  initCommandRouter(fakeBot)
  assert.strictEqual(onCount, 1, `Expected 1 chat listener, got ${onCount}`)
})

test('initCommandRouter setup completes without error', () => {
  const fakeBot = {
    on: () => {},
    pathfinder: null,
    players: {},
    _debug: false
  }
  assert.doesNotThrow(() => {
    initCommandRouter(fakeBot)
  })
})

// --- SYNTAX CHECK ---
console.log('\n--- Syntax Validation ---')

test('All modules can be imported without error', () => {
  // Already imported above
  assert.ok(true)
})

// --- SUMMARY ---
console.log(`\n=== TEST SUMMARY ===`)
console.log(`Total: ${testCount}, Passed: ${passCount}, Failed: ${failCount}`)
if (failCount === 0) {
  console.log('✅ All tests passed!')
  process.exit(0)
} else {
  console.log(`❌ ${failCount} test(s) failed`)
  process.exit(1)
}
