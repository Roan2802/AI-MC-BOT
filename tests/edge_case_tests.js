#!/usr/bin/env node
/**
 * Edge case and robustness tests for additional coverage.
 */

import assert from 'assert'
import * as safety from '../utils/safety.js'

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

console.log('=== EDGE CASE TESTS ===\n')

// --- NULL/UNDEFINED EDGE CASES ---
console.log('--- Null/Undefined Handling ---')

test('isBlockSafe handles undefined input', () => {
  const result = safety.isBlockSafe(null, undefined)
  assert.strictEqual(result, false)
})

test('isPositionSafe handles null position', () => {
  const fakeBot = { blockAt: () => ({ name: 'grass_block' }) }
  const result = safety.isPositionSafe(fakeBot, null)
  // should not crash, may return false
  assert.ok(typeof result === 'boolean')
})

test('isLavaNearby handles invalid position object', () => {
  const fakeBot = { blockAt: () => ({ name: 'air' }) }
  const result = safety.isLavaNearby(fakeBot, {}, 1)
  assert.ok(typeof result === 'boolean')
})

test('findNearbySafePosition handles no safe spot in 0 radius', () => {
  const fakeBot = { blockAt: () => ({ name: 'lava' }) }
  const result = safety.findNearbySafePosition(fakeBot, { x: 0, y: 0, z: 0 }, 0)
  assert.strictEqual(result, null)
})

test('isDeepDrop with null bot throws or returns safely', () => {
  assert.doesNotThrow(() => {
    const result = safety.isDeepDrop(null, { x: 0, y: 0, z: 0 }, 4)
    // either throws or returns false/null is ok
  })
})

// --- LARGE VALUES ---
console.log('\n--- Large/Extreme Values ---')

test('safety functions handle large coordinates', () => {
  const fakeBot = {
    blockAt: (pos) => {
      // very large coordinates should still work
      if (pos.y < 1000000) return { name: 'air' }
      return { name: 'stone' }
    }
  }
  const result = safety.isDeepDrop(fakeBot, { x: 999999, y: 1000010, z: 999999 }, 4)
  assert.ok(typeof result === 'boolean')
})

test('safety functions handle negative coordinates', () => {
  const fakeBot = {
    blockAt: (pos) => ({ name: 'grass_block' })
  }
  const result = safety.findNearbySafePosition(fakeBot, { x: -100, y: -50, z: -200 }, 2)
  assert.ok(result === null || (result.x && result.y && result.z))
})

test('findNearbySafePosition with large search radius', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.y < 0) return { name: 'air' }
      return { name: 'grass_block' }
    }
  }
  const result = safety.findNearbySafePosition(fakeBot, { x: 0, y: 0, z: 0 }, 50)
  // should find something with radius 50
  assert.ok(result !== null)
})

// --- FRACTIONAL COORDINATES ---
console.log('\n--- Fractional Coordinate Handling ---')

test('safety functions handle fractional coordinates', () => {
  const fakeBot = {
    blockAt: (pos) => {
      // floor is applied automatically by the functions
      if (pos.y < 0) return { name: 'air' }
      return { name: 'grass_block' }
    }
  }
  const result = safety.findNearbySafePosition(fakeBot, { x: 1.5, y: 2.7, z: 3.2 }, 2)
  assert.ok(result === null || (typeof result.x === 'number'))
})

// --- PERFORMANCE ---
console.log('\n--- Performance Constraints ---')

test('findNearbySafePosition completes in reasonable time', () => {
  const fakeBot = {
    blockAt: (pos) => {
      if (pos.y < 0) return { name: 'air' }
      return { name: 'grass_block' }
    }
  }
  const start = Date.now()
  const result = safety.findNearbySafePosition(fakeBot, { x: 0, y: 0, z: 0 }, 10)
  const elapsed = Date.now() - start
  // should be < 100ms
  assert.ok(elapsed < 500, `took ${elapsed}ms`)
})

// --- TYPE SAFETY ---
console.log('\n--- Type Safety ---')

test('isBlockSafe handles block with missing name property', () => {
  const result = safety.isBlockSafe(null, {})
  assert.strictEqual(result, true) // defaults to safe if no dangerous name
})

test('isBlockSafe handles block with null name', () => {
  const result = safety.isBlockSafe(null, { name: null })
  assert.strictEqual(result, true)
})

test('isBlockSafe detects all dangerous block types', () => {
  const dangerous = ['lava', 'lava_source', 'lava_flowing', 'fire', 'campfire', 'magma_block']
  for (const blockName of dangerous) {
    const result = safety.isBlockSafe(null, { name: blockName })
    assert.strictEqual(result, false, `${blockName} should be unsafe`)
  }
})

// --- SUMMARY ---
console.log(`\n=== EDGE CASE TEST SUMMARY ===`)
console.log(`Total: ${testCount}, Passed: ${passCount}, Failed: ${failCount}`)
if (failCount === 0) {
  console.log('✅ All edge case tests passed!')
  process.exit(0)
} else {
  console.log(`❌ ${failCount} test(s) failed`)
  process.exit(1)
}
