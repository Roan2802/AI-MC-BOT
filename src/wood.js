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
const { getBestAxe } = require('./crafting.js')

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
 * Collect nearby dropped items (logs, sticks, saplings, apples)
 * @param {import('mineflayer').Bot} bot
 * @param {number} radius
 * @returns {Promise<void>}
 */
async function collectNearbyItems(bot, radius = 10) {
  try {
    const pathfinderPkg = require('mineflayer-pathfinder')
    const { goals } = pathfinderPkg
    
    // Items we want to collect
    const wantedItems = ['log', 'sapling', 'stick', 'apple', 'planks']
    
    const nearbyItems = Object.values(bot.entities).filter(e => {
      // Check if entity is an item (use displayName or type instead of objectType)
      if (!e.displayName || e.displayName !== 'Item') return false
      if (!e.position) return false
      if (e.position.distanceTo(bot.entity.position) >= radius) return false
      
      // Try to identify item type from metadata
      if (e.metadata && e.metadata[8]) {
        const itemId = e.metadata[8].itemId
        if (itemId) {
          const itemName = bot.registry.items[itemId]?.name || ''
          return wantedItems.some(wanted => itemName.includes(wanted))
        }
      }
      return false
    })
    
    for (const item of nearbyItems) {
      try {
        const dist = bot.entity.position.distanceTo(item.position)
        if (dist > 2) {
          const goal = new goals.GoalNear(item.position.x, item.position.y, item.position.z, 1)
          await bot.pathfinder.goto(goal)
        }
        await new Promise(r => setTimeout(r, 200)) // Let auto-pickup work
      } catch (e) {
        // Item may already be picked up or despawned
      }
    }
  } catch (e) {
    if (bot._debug) console.log('[Wood] Collect items failed:', e.message)
  }
}

/**
 * Find suitable position for sapling replanting with 4-block spacing
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} basePos - Base position of tree
 * @param {number} radius
 * @returns {Vec3|null} position where sapling should be placed
 */
function findSaplingPosition(bot, basePos, radius = 5) {
  // Check ground level around base for suitable dirt/grass
  const pos = basePos.clone()
  pos.y = Math.floor(pos.y)
  
  // Check if position is at least 4 blocks away from other saplings
  const existingSaplings = []
  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      const checkPos = pos.offset(dx, 0, dz)
      const block = bot.blockAt(checkPos)
      if (block && block.name && block.name.includes('sapling')) {
        existingSaplings.push(checkPos)
      }
    }
  }
  
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const checkPos = pos.offset(dx, 0, dz)
      const block = bot.blockAt(checkPos)
      const below = bot.blockAt(checkPos.offset(0, -1, 0))
      
      if (block && block.name === 'air' && below && 
          (below.name === 'dirt' || below.name === 'grass_block' || below.name === 'podzol')) {
        
        // Check 4-block spacing from other saplings
        const tooClose = existingSaplings.some(s => s.distanceTo(checkPos) < 4)
        if (!tooClose) {
          return checkPos
        }
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
 * - Sapling replanting for sustainability (4-block spacing)
 * - Auto-craft planks/sticks when inventory has logs
 * - Obstacle breaking when stuck
 * - Item collection (logs, saplings, sticks, apples)
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

  let collected = 0
  let treesChopped = 0

  const pathfinderPkg = require('mineflayer-pathfinder')
  const { Movements, goals } = pathfinderPkg

  // Continue until we reach maxBlocks or no more trees found
  while (collected < maxBlocks) {
    // STEP 1: Plant any saplings we have FIRST before crafting
    if (opts.replant) {
      const allSaplings = bot.inventory.items().filter(i => i.name && i.name.includes('sapling'))
      if (allSaplings.length > 0) {
        bot.chat(`🌱 Plant eerst ${allSaplings.reduce((sum, s) => sum + s.count, 0)} saplings`)
        
        for (const saplingItem of allSaplings) {
          const treeType = saplingItem.name.replace('_sapling', '')
          let saplingCount = saplingItem.count
          
          while (saplingCount > 0) {
            const currentPos = bot.entity.position.clone()
            const saplingPos = findSaplingPosition(bot, currentPos, 5)
            if (saplingPos) {
              try {
                const movements = new Movements(bot)
                bot.pathfinder.setMovements(movements)
                const goal = new goals.GoalNear(saplingPos.x, saplingPos.y, saplingPos.z, 2)
                await bot.pathfinder.goto(goal)
                const planted = await replantSapling(bot, saplingPos, treeType)
                if (!planted) break
                saplingCount--
              } catch (e) {
                break
              }
            } else {
              break
            }
          }
        }
        
        const remainingSaplings = bot.inventory.items().filter(i => i.name && i.name.includes('sapling'))
        if (remainingSaplings.length > 0) {
          const total = remainingSaplings.reduce((sum, s) => sum + s.count, 0)
          bot.chat(`🌱 ${total} saplings over (geen ruimte)`)
        }
      }
    }
    
    // STEP 2: Check if we have an axe, try to craft one if we have materials
    const { ensureToolFor } = require('./crafting.js')
    const currentAxe = getBestAxe(bot)
    
    if (!currentAxe) {
      // Try to craft axe if we have enough materials
      const hasLogs = bot.inventory.items().find(i => i.name && i.name.includes('log'))
      const hasPlanks = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
      const hasSticks = bot.inventory.items().find(i => i.name === 'stick')
      
      // Only try to craft if we have some materials (at least logs or planks+sticks)
      if ((hasLogs && hasLogs.count >= 2) || (hasPlanks && hasPlanks.count >= 3 && hasSticks && hasSticks.count >= 2)) {
        bot.chat('🔨 Probeer axe te craften...')
        await ensureToolFor(bot, 'wood')
      } else {
        bot.chat('⚠️ Geen axe, hak met blote hand tot genoeg materiaal')
      }
    }
    
    // Equip best axe if we have one
    const bestAxe = getBestAxe(bot)
    if (bestAxe) {
      await bot.equip(bestAxe, 'hand')
    } else {
      // Unequip to use bare hands
      try {
        await bot.unequip('hand')
      } catch (e) {
        // Already bare hands
      }
    }
    
    const origin = bot.entity.position
    
    // STEP 3: Find nearest log block
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

    bot.chat(`🌲 Boom hakken: ${cluster.length} logs (${treeType})`)

    // Sort by y descending (top to bottom) to prevent floating logs
    cluster.sort((a, b) => b.position.y - a.position.y)

    // STEP 4: Mine all logs in this tree
    for (const block of cluster) {
      if (collected >= maxBlocks) break
      
      try {
        // Navigate to block if too far
        const dist = bot.entity.position.distanceTo(block.position)
        if (dist > 4.5) {
          const movements = new Movements(bot)
          movements.canDig = true // Allow breaking obstacles
          bot.pathfinder.setMovements(movements)
          
          try {
            const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3)
            await bot.pathfinder.goto(goal)
          } catch (navError) {
            // If stuck, try to break obstacle
            if (bot._debug) console.log('[Wood] Navigation blocked, trying to clear path')
            const obstacle = bot.blockAt(bot.entity.position.offset(0, 0, 1))
            if (obstacle && obstacle.name !== 'air' && obstacle.diggable) {
              await bot.dig(obstacle)
              await new Promise(r => setTimeout(r, 300))
            }
          }
        }
        
        // Equip best axe before digging
        const axe = getBestAxe(bot)
        if (axe) await bot.equip(axe, 'hand')

        // Dig the block
        await bot.dig(block, true)
        collected++
        
        // Small delay for drops to spawn
        await new Promise(r => setTimeout(r, 300))
        
      } catch (e) {
        if (bot._debug) console.log('[Wood] Dig failed:', e.message)
      }
    }

    treesChopped++
    bot.chat(`✅ Boom ${treesChopped} gehakt`)

    // STEP 5: Collect all items from this tree
    await new Promise(r => setTimeout(r, 1000)) // Wait for all drops
    await collectNearbyItems(bot, 15)
    bot.chat(`📦 Items verzameld`)

    // Note: Saplings will be planted at the start of next loop iteration (before crafting table)

    // Small break before next tree
    await new Promise(r => setTimeout(r, 500))
  }

  // Final item collection sweep
  await collectNearbyItems(bot, 20)

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
  replantSapling,
  collectNearbyItems
}
