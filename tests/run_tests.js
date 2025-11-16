import assert from 'assert'
import * as safety from '../utils/safety.js'
import * as combat from '../src/combat.js'
import * as combatEnhanced from '../src/combatEnhanced.js'
import initCommandRouter from '../commands/commandRouter.js'

console.log('Running quick unit tests...');

// --- Safety tests ---
(function testSafety() {
  const fakeBot = {
    blockAt: (pos) => {
      // lava at (0,0,0), air below y<0, otherwise grass
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) return { name: 'lava' }
      if (pos.y < 0) return { name: 'air' }
      return { name: 'grass_block' }
    }
  }

  // isLavaNearby should detect lava near origin
  const lavaNear = safety.isLavaNearby(fakeBot, { x: 0, y: 0, z: 0 }, 1)
  console.log('isLavaNearby @ origin ->', lavaNear)
  assert.strictEqual(lavaNear, true)

  // isPositionSafe false at lava
  const safeAtOrigin = safety.isPositionSafe(fakeBot, { x: 0, y: 0, z: 0 })
  console.log('isPositionSafe origin ->', safeAtOrigin)
  assert.strictEqual(safeAtOrigin, false)

  // deep drop test: position with many air blocks below
  const fakeBot2 = {
    blockAt: (pos) => {
      // return air for blocks below y=20 to simulate deep drop
      if (pos.y < 20) return { name: 'air' }
      return { name: 'stone' }
    }
  }
  const deep = safety.isDeepDrop(fakeBot2, { x: 0, y: 20, z: 0 }, 4)
  console.log('isDeepDrop (should be true) ->', deep)
  assert.strictEqual(deep, true)

  // findNearbySafePosition should return something when there is safe ground
  const fakeBot3 = {
    blockAt: (pos) => {
      if (pos.y < 0) return { name: 'air' }
      return { name: 'grass_block' }
    }
  }
  const safePos = safety.findNearbySafePosition(fakeBot3, { x: 0, y: 0, z: 0 }, 3)
  console.log('findNearbySafePosition ->', safePos)
  assert.ok(safePos && typeof safePos.x === 'number')

  console.log('Safety tests passed');
})();
// --- Combat enhanced tests ---
(function testCombatEnhanced() {
  // test enhancedAttack fallback to bot.attack
  let attacked = false
  const fakeBot = {
    attack: (ent) => { attacked = true },
    _debug: true
  }
  const result = combatEnhanced.enhancedAttack(fakeBot, { name: 'zombie' })
  console.log('enhancedAttack fallback result ->', result, 'attacked ->', attacked)
  assert.strictEqual(result, true)
  assert.strictEqual(attacked, true)
  console.log('CombatEnhanced tests passed')
})();

// --- Combat protect tests ---
(function testCombatProtect() {
  const fakeBot = {}
  const ok = combat.protectPlayer(fakeBot, 'Roan')
  console.log('protectPlayer set ->', ok, 'protectTarget ->', fakeBot._protectTarget)
  assert.strictEqual(ok, true)
  assert.strictEqual(fakeBot._protectTarget, 'Roan')
  combat.stopProtect(fakeBot)
  console.log('stopProtect cleared ->', fakeBot._protectTarget === undefined)
  assert.strictEqual(fakeBot._protectTarget, undefined)
  console.log('Combat protect tests passed');
})();
// --- Command router init guard test ---
(function testRouterInitGuard() {
  let onCount = 0
  const fakeBot = {
    on: (evt, fn) => { if (evt === 'chat') onCount++ },
    pathfinder: null,
    players: {}
  }
  // call init twice
  initCommandRouter(fakeBot)
  initCommandRouter(fakeBot)
  console.log('commandRouter registered chat handler count ->', onCount)
  // Expect only 1 registration
  assert.strictEqual(onCount, 1)
  console.log('Command router init guard test passed');
})();
console.log('All quick tests OK')
