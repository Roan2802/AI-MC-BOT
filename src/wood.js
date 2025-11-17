/**
 * Wood harvesting helpers
 *
 * Advanced tree harvesting with:
 * - Complete tree felling (no floating logs)
 * - Sapling replanting
 * - Auto-craft planks/sticks when needed
 * - Multiple tree type support
 */

const { mineResource } = require('./mining.js')
const { ensureToolFor } = require('./crafting.js')

/**
 * Find connected log blocks (flood-fill) starting from a root log.
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @returns {Array<import('prismarine-block').Block>} array of log blocks
 */
function findConnectedLogs(bot, startBlock, radius = 20) {
  const origin = bot.entity.position
  const visited = new Set()
  const toVisit = [startBlock.position]
  const blocks = []

  const key = (p) => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`

  while (toVisit.length > 0 && blocks.length < 256) {
    const pos = toVisit.shift()
    const k = key(pos)
    if (visited.has(k)) continue
    visited.add(k)
    const b = bot.blockAt(pos)
    if (!b || !b.name) continue
    if (!b.name.includes('log')) continue
    if (pos.distanceTo(origin) > radius) continue
    blocks.push(b)

    // neighbors: up/down and 4 horizontal + diagonals for better detection
    const neighbors = [
      [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,1,0], [0,-1,0],
      [1,0,1], [1,0,-1], [-1,0,1], [-1,0,-1] // diagonals
    ]
    for (const n of neighbors) {
      const np = pos.offset(n[0], n[1], n[2])
      const nk = key(np)
      if (!visited.has(nk)) toVisit.push(np)
    }
  }
  return blocks
}

/**
 * Find leaves connected to a tree to determine sapling position
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} basePos - Base position of tree
 * @param {number} radius
 * @returns {Vec3|null} position where sapling should be placed
 */
function findSaplingPosition(bot, basePos, radius = 5) {
  // Check ground level around base for suitable dirt/grass
  const pos = basePos.clone()
  pos.y = Math.floor(pos.y)
  
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const checkPos = pos.offset(dx, 0, dz)
      const block = bot.blockAt(checkPos)
      const below = bot.blockAt(checkPos.offset(0, -1, 0))
      
      if (block && block.name === 'air' && below && 
          (below.name === 'dirt' || below.name === 'grass_block' || below.name === 'podzol')) {
        return checkPos
      }
    }
  }
  return null
}

/**
 * Replant sapling after cutting tree
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} position - Where to plant
 * @param {string} treeType - oak, birch, spruce, etc
 */
async function replantSapling(bot, position, treeType = 'oak') {
  try {
    const saplingName = `${treeType}_sapling`
    const sapling = bot.inventory.items().find(i => i.name === saplingName)
    
    if (!sapling) {
      if (bot._debug) console.log(`[Wood] No ${saplingName} to replant`)
      return false
    }

    await bot.equip(sapling, 'hand')
    const blockBelow = bot.blockAt(position.offset(0, -1, 0))
    
    if (blockBelow && (blockBelow.name === 'dirt' || blockBelow.name === 'grass_block' || blockBelow.name === 'podzol')) {
      await bot.placeBlock(blockBelow, new bot.Vec3(0, 1, 0))
      bot.chat(`🌱 Sapling herplant op ${Math.floor(position.x)}, ${Math.floor(position.z)}`)
      return true
    }
  } catch (e) {
    if (bot._debug) console.log('[Wood] Replant failed:', e.message)
  }
  return false
}

/**
 * Craft planks from logs
 * @param {import('mineflayer').Bot} bot
 * @param {number} count - Number of plank sets to craft (1 log = 4 planks)
 * @returns {Promise<number>} planks crafted
 */
async function craftPlanks(bot, count = 8) {
  try {
    const logs = bot.inventory.items().find(i => i.name && i.name.includes('log'))
    if (!logs) return 0

    const plankType = logs.name.replace('_log', '_planks')
    const recipes = bot.recipesFor(bot.registry.itemsByName[plankType].id, null, 1, null)
    
    if (recipes && recipes.length > 0) {
      const toCraft = Math.min(count, logs.count)
      await bot.craft(recipes[0], toCraft)
      bot.chat(`🪵 ${toCraft * 4} planks gecraft`)
      return toCraft * 4
    }
  } catch (e) {
    if (bot._debug) console.log('[Wood] Craft planks failed:', e.message)
  }
  return 0
}

/**
 * Craft sticks from planks
 * @param {import('mineflayer').Bot} bot
 * @param {number} count - Sets of sticks to craft (2 planks = 4 sticks)
 * @returns {Promise<number>} sticks crafted
 */
async function craftSticks(bot, count = 4) {
  try {
    const planks = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
    if (!planks) {
      await craftPlanks(bot, count)
    }

    const recipes = bot.recipesFor(bot.registry.itemsByName.stick.id, null, 1, null)
    if (recipes && recipes.length > 0) {
      const toCraft = Math.min(count, Math.floor(planks.count / 2))
      await bot.craft(recipes[0], toCraft)
      bot.chat(`🪵 ${toCraft * 4} sticks gecraft`)
      return toCraft * 4
    }
  } catch (e) {
    if (bot._debug) console.log('[Wood] Craft sticks failed:', e.message)
  }
  return 0
}

/**
 * Harvest wood blocks within a radius by felling whole trees.
 * Features:
 * - Complete tree felling (top to bottom, no floating logs)
 * - Sapling replanting for sustainability
 * - Auto-craft planks/sticks when inventory has logs
 * 
 * @param {import('mineflayer').Bot} bot
 * @param {number} [radius=20]
 * @param {number} [maxBlocks=32]
 * @param {Object} [options]
 * @param {boolean} [options.replant=true] - Replant saplings
 * @param {boolean} [options.craftPlanks=false] - Auto-craft planks
 * @param {boolean} [options.craftSticks=false] - Auto-craft sticks
 * @returns {Promise<number>} Number of blocks successfully harvested
 */
async function harvestWood(bot, radius = 20, maxBlocks = 32, options = {}) {
  const opts = {
    replant: options.replant !== false,
    craftPlanks: options.craftPlanks || false,
    craftSticks: options.craftSticks || false
  }

  // ensure we have an axe
  await ensureToolFor(bot, 'wood')

  let collected = 0
  let treesChopped = 0

  // Continue until we reach maxBlocks or no more trees found
  while (collected < maxBlocks) {
    const origin = bot.entity.position
    
    // Find nearest log block
    const logBlock = bot.findBlock({
      matching: b => b && b.name && b.name.includes('log'),
      maxDistance: radius,
      count: 1
    })
    
    if (!logBlock) {
      if (bot._debug) console.log('[Wood] No more trees found')
      break
    }

    // Get tree type for sapling
    const treeType = logBlock.name.replace('_log', '')
    const basePos = logBlock.position.clone()

    // Find all connected logs in this tree
    const cluster = findConnectedLogs(bot, logBlock, radius)
    if (!cluster || cluster.length === 0) break

    bot.chat(`🌲 Boom gevonden: ${cluster.length} logs (${treeType})`)

    // Sort by y descending (top to bottom) to prevent floating logs
    cluster.sort((a, b) => b.position.y - a.position.y)

    // Mine all logs in tree
    for (const b of cluster) {
      if (collected >= maxBlocks) break
      try {
        await bot.dig(b, true)
        collected++
        await new Promise(r => setTimeout(r, 200)) // Small delay for drops
      } catch (e) {
        if (bot._debug) console.log('[Wood] Dig failed:', e.message)
      }
    }

    treesChopped++

    // Replant sapling if enabled
    if (opts.replant) {
      await new Promise(r => setTimeout(r, 500)) // Wait for drops
      const saplingPos = findSaplingPosition(bot, basePos, 3)
      if (saplingPos) {
        await replantSapling(bot, saplingPos, treeType)
      }
    }

    // Small break between trees
    await new Promise(r => setTimeout(r, 300))
  }

  bot.chat(`✅ Houthakken klaar: ${collected} logs van ${treesChopped} bomen`)

  // Auto-craft if enabled and we have logs
  if (opts.craftPlanks && collected > 0) {
    await new Promise(r => setTimeout(r, 500))
    await craftPlanks(bot, Math.floor(collected / 2))
  }

  if (opts.craftSticks && collected > 0) {
    await new Promise(r => setTimeout(r, 500))
    await craftSticks(bot, Math.floor(collected / 4))
  }

  return collected
}

module.exports = { 
  harvestWood, 
  craftPlanks, 
  craftSticks, 
  findConnectedLogs,
  replantSapling 
}
