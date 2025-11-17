/**
 * Mining Module
 * 
 * Locates and harvests resources within a radius.
 * Scans blocks, navigates to closest match, and digs.
 */

const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg
const { ensureWoodenPickaxe, ensureStonePickaxe, hasPickaxe } = require('./crafting-tools.js')
const { selectSafeTarget } = require('./navigation.js')

/**
 * Scan for blocks matching a resource type and harvest the closest one.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {string} resourceType - Block name fragment (e.g., 'oak_log', 'stone')
 * @param {number} [radius=20] - Scan radius in blocks
 * @returns {Promise<void>}
 * @throws {Error} If no matching blocks found or mining fails
 */
async function mineResource(bot, resourceType, radius = 20) {
  try {
    // Ensure we have a suitable pickaxe for stone/ores; prefer stone+ if possible
    const needPickaxeKeywords = ['stone', 'ore', 'coal', 'iron', 'andesite', 'granite', 'diorite']
    const needsPickaxe = needPickaxeKeywords.some(k => resourceType && resourceType.includes(k))
    if (needsPickaxe) {
      bot.chat('Controleer en maak (indien mogelijk) een betere pickaxe...')
      await ensureStonePickaxe(bot)
      if (!hasPickaxe(bot)) {
        bot.chat('Kon geen pickaxe maken, ik kan dit niet minen.')
        throw new Error('no_pickaxe')
      }
    }
    const pos = bot.entity.position
    const candidates = []

    // broaden resource matching: accept fragments like 'log','wood','oak','stone','ore'
    const fragments = []
    if (resourceType) fragments.push(resourceType)
    if (resourceType && resourceType.includes('_')) fragments.push(resourceType.split('_')[0])
    fragments.push('log')
    fragments.push('wood')
    fragments.push('stone')
    fragments.push('ore')

    // Scan cube for matching blocks (taller vertical range for trees/mines)
    const vy = Math.max(6, Math.floor(radius / 4))
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -vy; dy <= vy; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const p = pos.offset(dx, dy, dz)
          const block = bot.blockAt(p)
          if (!block || !block.name) continue
          const name = block.name.toLowerCase()
          // if any fragment matches
          if (fragments.some(f => name.includes(f))) {
            candidates.push(block)
          }
        }
      }
    }

    if (candidates.length === 0) {
      throw new Error(`Geen blokken gevonden: ${resourceType}`)
    }

    // Sort by distance, filter safe targets, pick closest
    const positions = candidates.map(c => c.position)
    const safe = positions.map(p => ({ x: p.x, y: p.y, z: p.z }))
    const best = selectSafeTarget(bot, safe) || positions[0]
    const target = candidates.find(c => c.position.equals(best)) || candidates[0]

    console.log(`[Mining] Found ${target.name} at ${target.position.x}, ${target.position.y}, ${target.position.z}`)
    bot.chat(`Ga naar ${target.name}`)

    // Navigate to target
    const movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)
    const goal = new goals.GoalBlock(target.position.x, target.position.y, target.position.z)
    bot.pathfinder.setGoal(goal)

    // Wait for arrival
    await waitForCondition(() => bot.entity.position.distanceTo(target.position) < 3, 40000)

    // Dig target (ensure it's still there)
    const fresh = bot.blockAt(target.position)
    if (!fresh) {
      bot.chat('Blok is niet meer aanwezig.')
      return
    }

    // Equip appropriate tool (axe for wood, pickaxe for stone) if available
    try {
      const inv = bot.inventory.items()
      const name = (fresh.name || '').toLowerCase()
      if (name.includes('log') || name.includes('wood')) {
        const axe = inv.find(it => it.name && it.name.includes('axe'))
        if (axe) await bot.equip(axe, 'hand')
      } else {
        const pick = inv.find(it => it.name && it.name.includes('pickaxe'))
        if (pick) await bot.equip(pick, 'hand')
      }
    } catch (e) {
      // ignore equip errors
    }

    await bot.dig(fresh)
    console.log(`[Mining] Mined ${target.name}`)
    bot.chat(`Klaar met hakken van ${target.name}`)
  } catch (e) {
    console.error('[Mining] Error:', e.message)
    throw new Error(`Mining error: ${e.message}`)
  }
}

/**
 * Wait for a condition to be true with timeout.
 * 
 * @param {function} check - Function returning boolean
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>}
 * @throws {Error} If timeout exceeded
 */
function waitForCondition(check, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval)
        resolve(true)
        return
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval)
        reject(new Error('Timeout wachten op conditie'))
      }
    }, 500)
  })
}

/**
 * Find connected ore blocks (simple flood-fill) starting from a root block.
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @returns {Array<import('prismarine-block').Block>} array of ore blocks
 */
function findConnectedOres(bot, startBlock, radius = 32) {
  const origin = bot.entity.position
  const visited = new Set()
  const toVisit = [startBlock.position]
  const blocks = []
  const key = (p) => `${p.x},${p.y},${p.z}`

  while (toVisit.length > 0 && blocks.length < 512) {
    const pos = toVisit.shift()
    const k = key(pos)
    if (visited.has(k)) continue
    visited.add(k)
    const b = bot.blockAt(pos)
    if (!b || !b.name) continue
    if (!b.name.includes('ore') && !['coal_ore','iron_ore','gold_ore','copper_ore','lapis_ore','diamond_ore','redstone_ore','emerald_ore'].some(n => b.name.includes(n))) continue
    if (pos.distanceTo(origin) > radius) continue
    blocks.push(b)

    // neighbors 6-dir
    const neighbors = [ [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,1,0], [0,-1,0] ]
    for (const n of neighbors) {
      const np = pos.offset(n[0], n[1], n[2])
      const nk = key(np)
      if (!visited.has(nk)) toVisit.push(np)
    }
  }
  return blocks
}

/**
 * Mine a connected vein of ores top-down (best-effort).
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @param {number} maxBlocks
 * @returns {Promise<number>} mined count
 */
async function mineVein(bot, startBlock, radius = 32, maxBlocks = 64) {
  const cluster = findConnectedOres(bot, startBlock, radius)
  if (!cluster || cluster.length === 0) return 0
  // sort by y descending so we mine higher blocks first
  cluster.sort((a,b) => b.position.y - a.position.y)
  let mined = 0
  for (const b of cluster) {
    if (mined >= maxBlocks) break
    try {
      await mineResource(bot, b.name, 12)
      mined++
      await new Promise(r => setTimeout(r, 300))
    } catch (e) {
      // ignore individual failures
    }
  }
  return mined
}

/**
 * Mine multiple ore blocks by locating an ore and vein-mining it.
 * @param {import('mineflayer').Bot} bot
 * @param {number} [radius=32]
 * @param {number} [maxBlocks=16]
 * @returns {Promise<number>} number of blocks mined
 */
async function mineOres(bot, radius = 32, maxBlocks = 16) {
  let mined = 0
  for (let i = 0; i < maxBlocks; i++) {
    // find nearest ore block
    const oreBlock = bot.findBlock({
      matching: b => b && b.name && b.name.includes('ore'),
      maxDistance: radius
    })
    if (!oreBlock) break
    const got = await mineVein(bot, oreBlock, radius, Math.min(64, maxBlocks - mined))
    mined += got
    if (got === 0) break
  }
  return mined
}

module.exports = { mineResource, mineOres }
