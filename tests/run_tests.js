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

// --- Scan for hostiles: only mobs, no animals ---
(function testScanForHostiles() {
  const makePos = (x, y, z) => ({
    x, y, z,
    distanceTo(p) {
      const dx = (p.x || 0) - x
      const dy = (p.y || 0) - y
      const dz = (p.z || 0) - z
      return Math.sqrt(dx * dx + dy * dy + dz * dz)
    }
  })

  const fakeBot = {
    entity: { position: makePos(0, 0, 0) },
    entities: {
      1: { id: 1, type: 'mob', name: 'cow', position: makePos(8, 0, 0) },
      2: { id: 2, type: 'mob', name: 'zombie', position: makePos(5, 0, 0) },
      3: { id: 3, type: 'mob', name: 'sheep', position: makePos(3, 0, 0) },
      4: { id: 4, type: 'mob', name: 'skeleton', position: makePos(6, 0, 0) },
      5: { id: 5, type: 'player', name: 'Roan', position: makePos(0, 0, 0) }
    },
    _debug: false
  }

  const found = combat.scanForHostiles(fakeBot, 12)
  console.log('scanForHostiles found ->', found && found.name, '(should be zombie or skeleton)')
  assert.ok(found && (found.name === 'zombie' || found.name === 'skeleton'), `Expected hostile, got ${found && found.name}`)
  
  // Verify non-hostiles are NOT returned
  const allZombie = combat.scanForHostiles(fakeBot, 12)
  assert.ok(!['cow', 'sheep'].includes(allZombie.name), 'Should not find animals')
  console.log('Scan for hostiles test passed (animals excluded, hostiles found)');
})();

console.log('All quick tests OK')
