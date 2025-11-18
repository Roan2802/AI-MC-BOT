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
const { getBestAxe, ensureToolFor, ensureWoodenAxe } = require('./crafting-tools.js')
const { ensureCraftingTable } = require('./crafting-blocks.js')
const { ensureCraftingTableOpen, craftPlanksFromLogs, craftSticks } = require('./crafting-recipes.js')
const { Vec3 } = require('vec3')
const pathfinderPkg = require('mineflayer-pathfinder')
const Movements = pathfinderPkg.Movements
const goals = pathfinderPkg.goals

// Ensure best axe is equipped (idempotent)
async function ensureBestAxeEquipped(bot) {
  try {
    const items = bot.inventory.items()
    const order = ['diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
    let best = null
    for (const name of order) {
      const found = items.find(i => i.name === name)
      if (found) { best = found; break }
    }
    if (!best) return false
    if (!bot.heldItem || bot.heldItem.name !== best.name) {
      await bot.equip(best, 'hand')
    }
    return true
  } catch (e) {
    return false
  }
}

/**
 * Collect nearby dropped items (logs, sticks, saplings, apples)
 * @param {import('mineflayer').Bot} bot
 * @param {number} radius
 * @returns {Promise<void>}
 */
async function collectNearbyItems(bot, radius = 10) {
  try {
    // Check if pathfinder is available
    if (!bot.pathfinder || !bot.pathfinder.goto) {
      if (bot._debug) console.log('[Wood] Pathfinder not available, skipping item collection')
      return
    }
    
    const pathfinderPkg = require('mineflayer-pathfinder')
    if (!pathfinderPkg || !pathfinderPkg.goals) {
      console.log('[Wood] Pathfinder package not loaded properly')
      return
    }
    const { goals } = pathfinderPkg
    
    // Items we want to collect
    const wantedItems = ['log', 'sapling', 'stick', 'apple', 'planks']
    
    const nearbyItems = Object.values(bot.entities).filter(e => {
      try {
        // Skip if no position
        if (!e || !e.position) return false
        if (e.position.distanceTo(bot.entity.position) >= radius) return false
        
        // Check if entity is an item using displayName first (newer), fallback to objectType
        let isItem = false
        try {
          // Try displayName first (non-deprecated)
          isItem = e.displayName === 'Item'
        } catch (e1) {
          // Fallback to objectType if displayName fails
          try {
            isItem = e.objectType === 'item' || e.objectType === 'Item'
          } catch (e2) {
            // Last resort: check name
            isItem = (e.name || '').includes('item')
          }
        }
        if (!isItem) return false
        
        // Try to identify item type from metadata
        if (e.metadata && e.metadata[8] && typeof e.metadata[8] === 'object') {
          try {
            const itemStack = e.metadata[8]
            const itemId = itemStack.itemId || itemStack.item_id
            if (itemId && bot.registry && bot.registry.items && bot.registry.items[itemId]) {
              const itemName = bot.registry.items[itemId].name || ''
              return wantedItems.some(wanted => itemName.includes(wanted))
            }
          } catch (parseErr) {
            // Metadata parsing failed, skip this entity
            return false
          }
        }
        return false
      } catch (filterErr) {
        return false
      }
    })
    
    if (bot._debug) console.log(`[Wood] Found ${nearbyItems.length} items to collect`)
    
    for (const item of nearbyItems) {
      try {
        const dist = bot.entity.position.distanceTo(item.position)
        if (dist > 2) {
          // Use fresh movements tuned for collection to avoid unnecessary digging
          try {
            const movements = new Movements(bot)
            // Be conservative while collecting loose items
            movements.canDig = false
            movements.allow1by1towers = false
            movements.scafoldingBlocks = []
            bot.pathfinder.setMovements(movements)
          } catch (e) {}
          const goal = new goals.GoalNear(item.position.x, item.position.y, item.position.z, 1)
          await bot.pathfinder.goto(goal)
        }
        await new Promise(r => setTimeout(r, 250)) // Let auto-pickup work
      } catch (e) {
        // Item may already be picked up or despawned
        if (bot._debug) console.log('[Wood] Item collection error:', e.message)
      }
    }
  } catch (e) {
    if (bot._debug) console.log('[Wood] Collect items failed:', e.message)
  }
}

/**
 * Plant a single sapling at a tree base immediately after chopping
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} treeBase - Tree base position
 * @param {Array<Vec3>} plantedPositions - Already planted positions to track
 * @returns {Promise<boolean>} True if planted successfully
 */
async function plantSaplingAtTreeBase(bot, treeBase, plantedPositions, options = {}) {
  try {
    const minSaplingSpacing = options.minSaplingSpacing ?? 3

    const findNearbyWorldSaplings = base => {
      const saplings = []
      for (let dx = -minSaplingSpacing - 1; dx <= minSaplingSpacing + 1; dx++) {
        for (let dz = -minSaplingSpacing - 1; dz <= minSaplingSpacing + 1; dz++) {
          const checkPos = base.offset(dx, 0, dz)
          const block = bot.blockAt(checkPos)
          if (block && block.name && block.name.includes('sapling')) {
            saplings.push(checkPos)
          }
        }
      }
      return saplings
    }

    // Get sapling type from tree base
    const treeType = await detectTreeTypeAtBase(bot, treeBase)
    const saplingName = `${treeType}_sapling`

    // Find ALL saplings in inventory (not just one)
    const allSaplings = bot.inventory.items().filter(i => i.name === saplingName)
    if (allSaplings.length === 0) {
      console.log(`[Wood] No ${saplingName} available for planting`)
      return false
    }

    // Count total saplings
    const totalSaplings = allSaplings.reduce((sum, item) => sum + item.count, 0)
    console.log(`[Wood] Found ${totalSaplings} ${saplingName}s to plant`)

    let planted = 0
    const existingWorldSaplings = findNearbyWorldSaplings(treeBase)

    // Plant as many saplings as we have (up to a reasonable limit)
    const maxToPlant = Math.min(totalSaplings, 5) // Max 5 saplings per tree (was 3)
    
    // Helper: find nearby valid ground spots (dirt/grass/podzol with air above)
    function findAlternativeGround(base, maxRadius = 5) {
      const spots = []
      for (let r = 1; r <= maxRadius; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            const pos = base.offset(dx, 0, dz)
            const below = bot.blockAt(pos.offset(0, -1, 0))
            const above = bot.blockAt(pos)
            if (!below || !above) continue
            if (above.name !== 'air') continue
            if (!['dirt', 'grass_block', 'podzol'].includes(below.name)) continue
            const tooClose = plantedPositions.some(p => p.distanceTo(pos) < minSaplingSpacing)
            if (tooClose) continue
            spots.push(pos)
          }
        }
      }
      return spots
    }

    for (let i = 0; i < maxToPlant; i++) {
      const sapling = bot.inventory.items().find(i => i.name === saplingName)
      if (!sapling) break

      // Find suitable position near tree base
      let targetPlantPos = findPlantingSpotNearBase(
        bot,
        treeBase,
        [...plantedPositions, ...existingWorldSaplings],
        minSaplingSpacing
      )
      if (!targetPlantPos) {
        const altSpots = findAlternativeGround(treeBase, 6)
        targetPlantPos = altSpots.find(p => true) || null
      }
      
      if (!targetPlantPos) {
        console.log(`[Wood] No more suitable planting spots near tree base`)
        break
      }

      // Equip sapling ONLY for planting
      await bot.equip(sapling, 'hand')
      const blockBelow = bot.blockAt(targetPlantPos.offset(0, -1, 0))

      if (blockBelow && ['dirt', 'grass_block', 'podzol'].includes(blockBelow.name)) {
        // Move closer if far
        try {
          const dist = bot.entity.position.distanceTo(targetPlantPos)
          if (dist > 4) {
            const movements = new Movements(bot)
            bot.pathfinder.setMovements(movements)
            const goal = new goals.GoalNear(targetPlantPos.x, targetPlantPos.y, targetPlantPos.z, 2)
            await bot.pathfinder.goto(goal)
          }
        } catch (e) {}

        // Look at ground to reduce placement fails
        try { await bot.lookAt(blockBelow.position.offset(0.5, 0.5, 0.5)) } catch (e) {}

        let placed = false
        for (let attempt = 0; attempt < 3 && !placed; attempt++) {
          try {
            await bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 })
            placed = true
          } catch (e) {
            await new Promise(r => setTimeout(r, 200))
          }
        }

        if (placed) {
          plantedPositions.push(targetPlantPos)
            existingWorldSaplings.push(targetPlantPos)
            planted++
            console.log(`[Wood] 🌱 Planted ${saplingName} #${planted} at ${Math.floor(targetPlantPos.x)}, ${Math.floor(targetPlantPos.z)}`)
            await new Promise(r => setTimeout(r, 250))
        } else {
          console.log('[Wood] Failed to place sapling after retries')
        }
      }
    }

    if (planted > 0) {
      bot.chat(`🌱 ${planted} sapling${planted > 1 ? 's' : ''} planted`)
    }
    
    // Re-equip axe after planting all saplings
    try {
      const axe = bot.inventory.items().find(i => i.name && i.name.includes('axe'))
      if (axe) {
        await bot.equip(axe, 'hand')
        console.log('[Wood] Axe re-equipped after planting')
      }
    } catch (e) {
      console.log('[Wood] Could not re-equip axe:', e.message)
    }
    
    return planted > 0
  } catch (e) {
    console.log('[Wood] Error planting sapling:', e.message)
    return false
  }
}

/**
 * Detect if bot is in water (feet or head block)
 */
function isInWater(bot) {
  try {
    const feet = bot.blockAt(bot.entity.position.floored())
    const head = bot.blockAt(bot.entity.position.offset(0, 1, 0).floored())
    const waterNames = ['water', 'flowing_water']
    return (feet && waterNames.includes(feet.name)) || (head && waterNames.includes(head.name))
  } catch (e) {
    return false
  }
}

/**
 * Find nearest dry land block to stand on (solid block with air above)
 */
function findNearestDryLand(bot, maxRadius = 6) {
  const origin = bot.entity.position.floored()
  let best = null
  let bestDist = Infinity
  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const pos = origin.offset(dx, dy, dz)
          const block = bot.blockAt(pos)
          const above = bot.blockAt(pos.offset(0, 1, 0))
          if (!block || !above) continue
          if (block.name === 'air' || block.name.includes('water')) continue
          if (above.name !== 'air') continue
          const dist = origin.distanceTo(pos)
          if (dist < bestDist) {
            bestDist = dist
            best = pos
          }
        }
      }
    }
    if (best) break
  }
  return best
}

/**
 * Recover from water: navigate to nearest dry land and ensure we stay there.
 */
async function recoverFromWater(bot) {
  if (!isInWater(bot)) return false
  try {
    const target = findNearestDryLand(bot, 8)
    if (!target) return false
    const movements = new Movements(bot)
    // discourage going back into water by disallowing digging while recovering
    movements.canDig = false
    bot.pathfinder.setMovements(movements)
    const goal = new goals.GoalNear(target.x, target.y, target.z, 1)
    await bot.pathfinder.goto(goal)
    // small forward nudge to leave edge
    bot.setControlState('back', false)
    bot.setControlState('forward', true)
    await new Promise(r => setTimeout(r, 300))
    bot.setControlState('forward', false)
    return true
  } catch (e) {
    return false
  }
}

/**
 * Re-craft wooden axe mid-harvest if lost/broken.
 */
async function ensureAxeMidRun(bot, radius) {
  const existingAxe = getBestAxe(bot)
  if (existingAxe) return true
  console.log('[Wood] Axe missing mid-run, re-crafting...')
  bot.chat('🪓 Axe weg / stuk, opnieuw maken...')
  // Recraft is interactive; pause stuck detector to avoid interference
  const prevTaskFlag = bot.isDoingTask; bot.isDoingTask = false

  // Helper: craft with a simple retry/backoff (handles updateSlot timeouts)
  async function craftWithRetry(recipe, times, tableBlock) {
    const delays = [0, 500, 1200]
    let lastErr
    for (let i = 0; i < delays.length; i++) {
      try {
        if (delays[i] > 0) await new Promise(r => setTimeout(r, delays[i]))
        await bot.craft(recipe, times, tableBlock)
        return true
      } catch (e) {
        lastErr = e
        // try to re-open table between retries
        try {
          if (tableBlock) {
            if (bot.currentWindow) { try { bot.closeWindow(bot.currentWindow) } catch (_) {} }
            await new Promise(r => setTimeout(r, 200))
            await bot.openBlock(tableBlock)
          }
        } catch (_) {}
      }
    }
    if (lastErr) throw lastErr
    return false
  }
  // gather 5 fresh logs if needed
  const countLogsInInventory = () => bot.inventory.items().filter(i => i.name && i.name.includes('log')).reduce((s, it) => s + it.count, 0)
  if (countLogsInInventory() < 5) {
    await ensureLogSupplyInternal(bot, 5, radius)
  }
  // craft planks
  try {
    const logsItem = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
    if (logsItem) {
      await craftPlanksFromLogs(bot, Math.min(3, logsItem.count))
    }
  } catch (e) {}
  // Track if we are about to place a temporary table
  const tableBefore = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6, count: 1 })
  // ensure crafting table
  const hasTable = await ensureCraftingTable(bot)
  if (!hasTable) {
    bot.chat('❌ Kan geen crafting table plaatsen voor axe')
    // Restore task flag before exit
    bot.isDoingTask = prevTaskFlag
    return false
  }
  
  // Verify table exists and is accessible
  const craftingTableBlock = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6, count: 1 })
  if (!craftingTableBlock) {
    console.log('[Wood] Crafting table not found after placement')
    bot.chat('❌ Crafting table verdwenen')
    bot.isDoingTask = prevTaskFlag
    return false
  }
  
  // Open the crafting table
  const opened = await ensureCraftingTableOpen(bot)
  if (!opened) {
    console.log('[Wood] Could not open crafting table for mid-run axe')
    bot.chat('❌ Kan crafting table niet openen')
    bot.isDoingTask = prevTaskFlag
    return false
  }
  // craft sticks if low
  const totalSticks = bot.inventory.items().filter(i => i.name === 'stick').reduce((s, it) => s + it.count, 0)
  const totalPlanks = bot.inventory.items().filter(i => i.name && i.name.includes('planks')).reduce((s, it) => s + it.count, 0)
  if (totalSticks < 2 && totalPlanks >= 2) {
    try {
      const stickItemId = bot.registry.itemsByName.stick
      if (stickItemId) {
        // Use crafting table for stick crafting (more reliable than inventory crafting)
        const tableBlock = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6, count: 1 })
        if (tableBlock) {
          const recipes = bot.recipesFor(stickItemId.id, null, 1, tableBlock)
          if (recipes && recipes.length > 0) {
            await craftWithRetry(recipes[0], 1, tableBlock)
            console.log('[Wood] Crafted sticks at table')
            await new Promise(r => setTimeout(r, 300))
          }
        }
      }
    } catch (e) {
      console.log('[Wood] Stick crafting error:', e.message)
    }
  }
  
  // craft axe - find crafting table again to be safe
  try {
    const craftingTableBlock = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6, count: 1 })
    if (!craftingTableBlock) {
      console.log('[Wood] Crafting table disappeared before axe crafting')
      bot.chat('❌ Crafting table weg')
      bot.isDoingTask = prevTaskFlag
      return false
    }
    
    const axeItem = bot.registry.itemsByName['wooden_axe']
    if (axeItem) {
      const recipes = bot.recipesFor(axeItem.id, null, 1, craftingTableBlock)
      if (recipes && recipes.length > 0) {
        await craftWithRetry(recipes[0], 1, craftingTableBlock)
        bot.chat('✅ Nieuwe houten axe klaar')
        await new Promise(r => setTimeout(r, 300))
        const newAxe = getBestAxe(bot)
        if (newAxe) await bot.equip(newAxe, 'hand')
        // Close crafting window if open
        if (bot.currentWindow) { try { bot.closeWindow(bot.currentWindow) } catch (_) {} }

        // Reclaim temporary crafting table if we placed it
        const tableAfter = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6, count: 1 })
        if (!tableBefore && tableAfter) {
          try {
            console.log('[Wood] Picking up temporary crafting table...')
            bot.chat('📦 Crafting table oppakken...')
            // Ensure axe in hand for faster break
            const axeNow = getBestAxe(bot)
            if (axeNow) { try { await bot.equip(axeNow, 'hand') } catch (_) {} }
            try { bot._isDigging = true } catch (_) {}
            await bot.dig(tableAfter)
            await new Promise(r => setTimeout(r, 600))
            await collectNearbyItems(bot, 8)
            console.log('[Wood] ✅ Crafting table collected')
          } catch (digErr) {
            console.log('[Wood] Could not pick up crafting table:', digErr.message)
          } finally {
            try { bot._isDigging = false } catch (_) {}
          }
        }

        // Restore task flag before success return
        bot.isDoingTask = prevTaskFlag
        return true
      } else {
        console.log('[Wood] No axe recipe found')
        bot.chat('❌ Geen axe recept')
        bot.isDoingTask = prevTaskFlag
        return false
      }
    }
  } catch (e) {
    console.log('[Wood] Mid-run axe craft error:', e.message)
    bot.chat('❌ Axe craft fout: ' + e.message)
  }
  // Restore task flag before exit
  bot.isDoingTask = prevTaskFlag
  return false
}

// Internal log supply helper (non-export) used for mid-run axe crafting
async function ensureLogSupplyInternal(bot, minLogs, radius) {
  let attempts = 0
  const countLogsInInventory = () => bot.inventory.items().filter(i => i && i.name && i.name.includes('log')).reduce((s, it) => s + it.count, 0)
  while (countLogsInInventory() < minLogs && attempts < 8) {
    attempts++
    const nextLog = bot.findBlock({ matching: b => b && b.name && b.name.includes('log'), maxDistance: radius, count: 1 })
    if (!nextLog) break
    try {
      const dist = bot.entity.position.distanceTo(nextLog.position)
      if (dist > 4) {
        const movements = new Movements(bot)
        bot.pathfinder.setMovements(movements)
        const goal = new goals.GoalNear(nextLog.position.x, nextLog.position.y, nextLog.position.z, 2)
        await bot.pathfinder.goto(goal)
      }
      const targetBlock = bot.blockAt(nextLog.position)
      if (targetBlock && targetBlock.diggable) {
        bot._isDigging = true
        await bot.dig(targetBlock)
        bot._isDigging = false
        await new Promise(r => setTimeout(r, 600))
        await collectNearbyItems(bot, 8)
      }
    } catch (e) { bot._isDigging = false }
  }
  return countLogsInInventory() >= minLogs
}

/**
 * Plant saplings near tree bases instead of random locations
 * @param {import('mineflayer').Bot} bot
 * @param {Array<Vec3>} treeBases - Array of tree base positions
 * @returns {Promise<number>} Number of saplings planted
 */
async function plantSaplingsAtTreeBases(bot, treeBases, options = {}) {
  try {
    if (!bot || !bot.inventory || !treeBases || treeBases.length === 0) {
      console.log('[Wood] plantSaplingsAtTreeBases: Invalid parameters')
      return 0
    }

    let planted = 0
    const plantedPositions = [] // Track where we've planted to avoid clustering
    const minSaplingSpacing = options.minSaplingSpacing ?? 3

    const findNearbyWorldSaplings = base => {
      const saplings = []
      for (let dx = -minSaplingSpacing - 1; dx <= minSaplingSpacing + 1; dx++) {
        for (let dz = -minSaplingSpacing - 1; dz <= minSaplingSpacing + 1; dz++) {
          const checkPos = base.offset(dx, 0, dz)
          const block = bot.blockAt(checkPos)
          if (block && block.name && block.name.includes('sapling')) {
            saplings.push(checkPos)
          }
        }
      }
      return saplings
    }

    for (const basePos of treeBases) {
      try {
        // Get sapling type from tree base (check what logs were there)
        const treeType = await detectTreeTypeAtBase(bot, basePos)
        const saplingName = `${treeType}_sapling`

        const sapling = bot.inventory.items().find(i => i.name === saplingName)
        if (!sapling) {
          console.log(`[Wood] No ${saplingName} available for planting at tree base`)
          continue
        }

        // Find suitable position near tree base (within 3 blocks, not on the base itself)
        const existingWorldSaplings = findNearbyWorldSaplings(basePos)
        const targetPlantPos = findPlantingSpotNearBase(
          bot,
          basePos,
          [...plantedPositions, ...existingWorldSaplings],
          minSaplingSpacing
        )
        if (!targetPlantPos) {
          console.log(`[Wood] No suitable planting spot near tree base at ${basePos.x}, ${basePos.z}`)
          continue
        }

        // Plant the sapling
        try {
          await bot.equip(sapling, 'hand')
          const blockBelow = bot.blockAt(targetPlantPos.offset(0, -1, 0))

          if (blockBelow && (blockBelow.name === 'dirt' || blockBelow.name === 'grass_block' || blockBelow.name === 'podzol')) {
            await bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 })
            planted++
            plantedPositions.push(targetPlantPos)
            console.log(
              `[Wood] Planted ${saplingName} at ${Math.floor(targetPlantPos.x)}, ${Math.floor(targetPlantPos.z)}`
            )
            await new Promise(r => setTimeout(r, 200))
          }
        } catch (plantErr) {
          console.log('[Wood] Failed to plant sapling:', plantErr.message)
        }
      } catch (baseErr) {
        console.error('[Wood] Error planting at tree base:', baseErr.message)
      }
    }

    if (planted > 0) {
      bot.chat(`🌱 ${planted} saplings geplant bij boom bases`)
    }
    return planted
  } catch (e) {
    console.error('[Wood] plantSaplingsAtTreeBases error:', e.message)
    return 0
  }
}

/**
 * Detect tree type at base position
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} basePos
 * @returns {Promise<string>}
 */
async function detectTreeTypeAtBase(bot, basePos) {
  try {
    // Check nearby blocks for log types
    const checkPositions = [
      basePos,
      basePos.offset(0, 1, 0),
      basePos.offset(1, 0, 0),
      basePos.offset(-1, 0, 0),
      basePos.offset(0, 0, 1),
      basePos.offset(0, 0, -1)
    ]

    for (const pos of checkPositions) {
      const block = bot.blockAt(pos)
      if (block && block.name && block.name.includes('log')) {
        return block.name.replace('_log', '')
      }
    }
  } catch (e) {
    console.log('[Wood] Error detecting tree type:', e.message)
  }
  return 'oak' // Default fallback
}

/**
 * Find suitable planting spot near tree base
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} basePos
 * @param {Array<Vec3>} existingPlants
 * @returns {Vec3|null}
 */
function findPlantingSpotNearBase(bot, basePos, existingPlants, minSaplingSpacing = 3) {
  // Check positions around base (not on base itself)
  const candidates = [
    basePos.offset(1, 0, 0),
    basePos.offset(-1, 0, 0),
    basePos.offset(0, 0, 1),
    basePos.offset(0, 0, -1),
    basePos.offset(1, 0, 1),
    basePos.offset(1, 0, -1),
    basePos.offset(-1, 0, 1),
    basePos.offset(-1, 0, -1),
    basePos.offset(2, 0, 0),
    basePos.offset(-2, 0, 0),
    basePos.offset(0, 0, 2),
    basePos.offset(0, 0, -2)
  ]

  for (const pos of candidates) {
    const block = bot.blockAt(pos)
    const below = bot.blockAt(pos.offset(0, -1, 0))

    // Must be air above suitable ground
    if (
      block &&
      block.name === 'air' &&
      below &&
      (below.name === 'dirt' || below.name === 'grass_block' || below.name === 'podzol')
    ) {
      // Check not too close to existing plants
      const tooClose = existingPlants.some(existing => existing.distanceTo(pos) < minSaplingSpacing)

      if (!tooClose) {
        return pos
      }
    }
  }
  return null
}

/**
 * Find connected log blocks (flood-fill) starting from a root log.
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @returns {Array<import('prismarine-block').Block>} array of log blocks
 */
function findConnectedLogs(bot, startBlock, radius = 20) {
  console.log(
    '[Wood] findConnectedLogs: called with',
    !!bot,
    !!startBlock,
    !!startBlock && !!startBlock.position
  )

  if (!bot || !startBlock || !startBlock.position) {
    console.log('[Wood] findConnectedLogs: Invalid input')
    return []
  }

  const visited = new Set()
  const logs = []
  const queue = [startBlock]

  // Determine the log type (oak_log, birch_log, etc.)
  const logType = startBlock.name

  console.log('[Wood] findConnectedLogs: Starting with log type', logType)

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || !current.position) continue

    const key = `${current.position.x},${current.position.y},${current.position.z}`
    if (visited.has(key)) continue
    visited.add(key)

    if (current.name === logType) {
      logs.push(current)

      // Check all 6 directions + diagonals (26 neighbors total for full tree coverage)
      const neighbors = []
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dy === 0 && dz === 0) continue
            const nPos = current.position.offset(dx, dy, dz)
            const nBlock = bot.blockAt(nPos)
            if (nBlock && nBlock.name === logType) {
              neighbors.push(nBlock)
            }
          }
        }
      }

      for (const n of neighbors) {
        const nKey = `${n.position.x},${n.position.y},${n.position.z}`
        if (!visited.has(nKey)) {
          queue.push(n)
        }
      }
    }
  }

  console.log(`[Wood] findConnectedLogs: Found ${logs.length} connected logs`)
  return logs
}

/**
 * Replant a sapling at a specific location
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} position - Position to plant at
 * @param {string} treeType - Tree type (oak, spruce, birch, jungle, acacia, dark_oak)
 * @returns {Promise<boolean>} true if planted successfully
 */
async function replantSapling(bot, position, treeType = 'oak') {
  try {
    const saplingType = `${treeType}_sapling`
    const sapling = bot.inventory.items().find(i => i && i.name === saplingType)
    
    if (!sapling) {
      if (bot._debug) console.log(`[Wood] No ${saplingType} in inventory`)
      return false
    }

    await bot.equip(sapling, 'hand')
    
    // Navigate to position if far
    const dist = bot.entity.position.distanceTo(position)
    if (dist > 4.5) {
      try {
        const pathfinderPkg = require('mineflayer-pathfinder')
        if (pathfinderPkg && pathfinderPkg.Movements && pathfinderPkg.goals) {
          const { Movements, goals } = pathfinderPkg
          const movements = new Movements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(position.x, position.y, position.z, 3)
          await bot.pathfinder.goto(goal)
        }
      } catch (navErr) {
        console.log('[Wood] Navigate to replant failed:', navErr.message)
        return false
      }
    }

    // Place the sapling
    const blockBelow = bot.blockAt(position.offset(0, -1, 0))
    if (blockBelow && !blockBelow.diggable) {
      await bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 })
      console.log(`[Wood] Replanted ${saplingType} at`, position)
      return true
    }
    
    return false
  } catch (e) {
    console.error('[Wood] Replant sapling error:', e.message)
    return false
  }
}

/**
 * Simple Wood Axe Workflow v2
 *
 * Flow voor !chop 10:
 * 1. Crafting table plaatsen + axe maken + crafting table ophakken
 * 2. Bomen zoeken en hakken
 * 3. Alle items uit de boom oppakken
 * 4. Saplings planten op min 3 blocks van andere saplings
 */
async function harvestWood(bot, radius = 50, maxBlocks = 32, options = {}) {
  console.log('[Wood] Starting Simple Wood Axe Workflow v2')
  bot.chat('🌲 Starting wood harvesting...')
  
  // NOTE: bot.isDoingTask will be enabled AFTER axe preparation is complete
  // This prevents stuck detection from interfering with initial log gathering

  let collected = 0
  let treesChopped = 0
  const treeBases = []
  const inventoryBufferSlots = options.inventoryBufferSlots ?? 2
  const minSaplingSpacing = options.minSaplingSpacing ?? 3

  const countLogsInInventory = () =>
    bot.inventory
      .items()
      .filter(i => i && i.name && i.name.includes('log'))
      .reduce((sum, item) => sum + (item.count || 0), 0)

  const ensureLogSupply = async (minLogs = 1, absolute = false) => {
    // Disable stuck detection during initial supply to prevent micro-nudges cancelling digs
    const prevTaskFlag = bot.isDoingTask
    bot.isDoingTask = false
    const startCount = countLogsInInventory()
    let attempts = 0
    const notEnough = () => {
      const current = countLogsInInventory()
      return absolute ? (current - startCount) < minLogs : current < minLogs
    }
    if (absolute) bot.chat(`🌲 Logs nodig: ${minLogs}`)
    while (notEnough() && attempts < 15) {
      attempts++
      const nextLog = bot.findBlock({ matching: b => b && b.name && b.name.includes('log'), maxDistance: radius, count: 1 })
      if (!nextLog) { console.log('[Wood] ensureLogSupply: No log found to mine'); break }
      try {
        const dist = bot.entity.position.distanceTo(nextLog.position)
        if (dist > 3) {
          const movements = new Movements(bot)
          movements.canDig = true
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(nextLog.position.x, nextLog.position.y, nextLog.position.z, 2)
          await bot.pathfinder.goto(goal)
        }
      } catch (navErr) { console.log('[Wood] ensureLogSupply: Navigation failed:', navErr.message) }
      const targetBlock = bot.blockAt(nextLog.position)
      if (!targetBlock || !targetBlock.diggable) { console.log('[Wood] ensureLogSupply: Target log no longer available'); continue }
      try {
        bot._isDigging = true
        await bot.dig(targetBlock)
        console.log('[Wood] ensureLogSupply: Log chopped, collecting...')
        try {
          const centerGoal = new goals.GoalNear(nextLog.position.x + 0.5, nextLog.position.y, nextLog.position.z + 0.5, 1)
          await bot.pathfinder.goto(centerGoal)
        } catch (_) {}
        await new Promise(r => setTimeout(r, 500))
        await collectNearbyItems(bot, 6)
        await new Promise(r => setTimeout(r, 300))
        const gained = countLogsInInventory() - startCount
        console.log(`[Wood] ensureLogSupply: Inventory now has ${countLogsInInventory()} logs (new +${Math.max(gained,0)})`)
        if (absolute) bot.chat(`📦 ${countLogsInInventory() - startCount}/${minLogs}`)
      } catch (digErr) { console.log('[Wood] ensureLogSupply: Dig failed:', digErr.message) } finally { bot._isDigging = false }
    }
    bot.isDoingTask = prevTaskFlag
    return absolute ? (countLogsInInventory() - startCount) >= minLogs : countLogsInInventory() >= minLogs
  }

  try {
    console.log('[Wood] Initializing pathfinder...')
    console.log('[Wood] Pathfinder ready')

    // STEP 1: Check if axe exists - if not, craft one FIRST
    console.log('[Wood] STEP 1: Checking for axe...')
    let axe = getBestAxe(bot)

    if (!axe) {
      console.log('[Wood] No axe found, crafting wooden axe...')
      bot.chat('🔨 Crafting wooden axe...')

      // Altijd eerst 3 logs hakken voordat we de bijl craften (genoeg voor table + axe)
      console.log('[Wood] Always chopping 3 logs before axe craft (optimized)...')
      bot.chat('🌲 Eerst 3 logs hakken voor de bijl...')
      const hasLogs = await ensureLogSupply(3, true)

      if (!hasLogs) {
        console.log('[Wood] Still not enough logs for axe + crafting table')
        bot.chat('❌ Not enough logs to craft axe')
        bot.isDoingTask = false // Disable stuck detection on early exit
        return 0
      }

      // Craft planks from logs (5 logs → 20 planks, use 3 for crafting)
      console.log('[Wood] Crafting planks from logs for axe + table...')
      const logsItem = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
      const logsToUse = Math.min(logsItem ? logsItem.count : 3, 3)
      if (logsToUse > 0) {
        await craftPlanksFromLogs(bot, logsToUse)
        await new Promise(r => setTimeout(r, 500))
      }

      // Check if crafting table already exists nearby
      const tableBefore = bot.findBlock({
        matching: b => b && b.name === 'crafting_table',
        maxDistance: 6,
        count: 1
      })

      // Ensure crafting table is present and reachable
      const hasTable = await ensureCraftingTable(bot)
      if (!hasTable) {
        console.log('[Wood] Could not craft/place crafting table')
        bot.chat('❌ Geen crafting table beschikbaar')
        bot.isDoingTask = false // Disable stuck detection on early exit
        return 0
      }

      const openedTable = await ensureCraftingTableOpen(bot)
      if (!openedTable) {
        console.log('[Wood] Could not open crafting table for axe recipe')
        bot.chat('❌ Crafting table niet bereikbaar')
        bot.isDoingTask = false
        return 0
      }

      // Find crafting table block for later use
      const craftingTableBlock = bot.findBlock({
        matching: b => b && b.name === 'crafting_table',
        maxDistance: 5,
        count: 1
      })

      // Craft sticks if needed (MANUALLY without closing window)
      const allPlanks = bot.inventory.items().filter(i => i && i.name && i.name.includes('planks'))
      const totalPlanks = allPlanks.reduce((s, it) => s + (it.count || 0), 0)
      const totalSticks = bot.inventory.items().filter(i => i && i.name === 'stick').reduce((s, it) => s + (it.count || 0), 0)
      
      if (totalSticks < 2 && totalPlanks >= 2) {
        console.log('[Wood] Crafting sticks for axe (without closing window)...')
        
        try {
          const stickItemId = bot.registry.itemsByName.stick
          if (stickItemId) {
            // Prefer crafting via the opened crafting table context
            let crafted = false
            if (craftingTableBlock) {
              const tableRecipes = bot.recipesFor(stickItemId.id, null, 1, craftingTableBlock)
              if (tableRecipes && tableRecipes.length > 0) {
                await bot.craft(tableRecipes[0], 1, craftingTableBlock) // Craft 4 sticks at table
                crafted = true
              }
            }
            if (!crafted) {
              const invRecipes = bot.recipesFor(stickItemId.id, null, 1, null)
              if (invRecipes && invRecipes.length > 0) {
                // If table is open, temporarily close and craft in 2x2
                const hadWindow = !!bot.currentWindow
                if (hadWindow) {
                  try { bot.closeWindow(bot.currentWindow) } catch (e) {}
                  await new Promise(r => setTimeout(r, 200))
                }
                await bot.craft(invRecipes[0], 1, null)
                crafted = true
                if (hadWindow && craftingTableBlock) {
                  await bot.openBlock(craftingTableBlock)
                  await new Promise(r => setTimeout(r, 200))
                }
              }
            }
            if (crafted) {
              console.log('[Wood] Crafted sticks')
              await new Promise(r => setTimeout(r, 400))
            } else {
              console.log('[Wood] No recipe found to craft sticks')
            }
          }
        } catch (e) {
          console.log('[Wood] Stick crafting error:', e.message)
        }
        
        // Re-open crafting table after stick crafting
        if (craftingTableBlock && (!bot.currentWindow || bot.currentWindow.type !== 'minecraft:crafting')) {
          console.log('[Wood] Re-opening crafting table for axe...')
          await bot.openBlock(craftingTableBlock)
          await new Promise(r => setTimeout(r, 500))
        }
      }

      // Craft axe (crafting table should be open)
      console.log('[Wood] Crafting wooden axe...')
      
      // Check materials
      const totalPlanksNow = bot.inventory.items().filter(i => i.name && i.name.includes('planks')).reduce((s, it) => s + (it.count || 0), 0)
      const totalSticksNow = bot.inventory.items().filter(i => i.name === 'stick').reduce((s, it) => s + (it.count || 0), 0)
      console.log(`[Wood] Materials: planks(total)=${totalPlanksNow}, sticks(total)=${totalSticksNow}`)
      
      if (totalPlanksNow < 3 || totalSticksNow < 2) {
        console.log('[Wood] Insufficient materials for axe')
        bot.chat('❌ Not enough materials for axe')
        bot.isDoingTask = false
        return 0
      }
      
      let axeCrafted = false
      try {
        const axeItem = bot.registry.itemsByName['wooden_axe']
        if (axeItem && craftingTableBlock) {
          const recipes = bot.recipesFor(axeItem.id, null, 1, craftingTableBlock)
          if (recipes && recipes.length > 0) {
            await bot.craft(recipes[0], 1, craftingTableBlock)
            axeCrafted = true
            console.log('[Wood] Wooden axe crafted successfully!')
            bot.chat('✅ Wooden axe crafted!')
            await new Promise(r => setTimeout(r, 500))
          }
        }
      } catch (e) {
        console.log('[Wood] Axe craft error:', e.message)
      }
      
      if (!axeCrafted) {
        console.log('[Wood] Axe crafting failed')
        bot.chat('❌ Axe crafting failed')
        bot.isDoingTask = false
        return 0
      }
      
      // Update axe reference
      axe = getBestAxe(bot)
      
      // Close crafting table window
      if (bot.currentWindow) {
        bot.closeWindow(bot.currentWindow)
        await new Promise(r => setTimeout(r, 300))
      }

      // Pick up temporary crafting table if we placed it
      const tableAfter = bot.findBlock({
        matching: b => b && b.name === 'crafting_table',
        maxDistance: 6,
        count: 1
      })

      if (!tableBefore && tableAfter) {
        try {
          console.log('[Wood] Picking up temporary crafting table...')
          bot.chat('📦 Picking up crafting table...')
          
          // Equip axe to break table faster
          if (axe) {
            await bot.equip(axe, 'hand')
          }
          
          try { bot._isDigging = true } catch (e) {}
          await bot.dig(tableAfter)
          await new Promise(r => setTimeout(r, 800))
          await collectNearbyItems(bot, 8)
          console.log('[Wood] Picked up temporary crafting table')
          bot.chat('✅ Crafting table collected!')
        } catch (digErr) {
          console.log('[Wood] Could not pick up temporary crafting table:', digErr.message)
        } finally {
          try { bot._isDigging = false } catch (e) {}
        }
      }
    } else {
      console.log(`[Wood] Using existing axe: ${axe.name}`)
      bot.chat(`🪓 Using ${axe.name}`)
    }

    // Equip axe
    if (axe) {
      await bot.equip(axe, 'hand')
      console.log('[Wood] Axe equipped')
    }

    // STEP 2: Main tree chopping loop
    console.log('[Wood] STEP 2: Starting tree chopping loop...')
    
    // Enable stuck detection NOW (after preparation is complete)
    bot.isDoingTask = true
    console.log('[Wood] Stuck detection enabled for tree chopping')
    
    const plantedSaplingPositions = [] // Track planted saplings for spacing
    
    while (collected < maxBlocks) {
      if (treesChopped >= (options.maxTrees ?? 500)) {
        console.log('[Wood] Max tree limit reached for this run')
        break
      }

      // Find tree block nearby
      console.log('[Wood] Finding tree block nearby...')
      const logBlock = bot.findBlock({
        matching: b => b && b.name && b.name.includes('log'),
        maxDistance: radius,
        count: 1
      })

      if (!logBlock) {
        console.log('[Wood] No tree blocks found nearby')
        bot.chat('❌ No trees found nearby')
        break
      }

      const treeBase = logBlock.position.floored()
      console.log(
        `[Wood] Found tree at distance ${bot.entity.position.distanceTo(logBlock.position)}`
      )
      bot.chat(
        `🌲 Found tree #${treesChopped + 1} at ${Math.floor(logBlock.position.x)}, ${Math.floor(logBlock.position.z)}`
      )

      // Water safety check before movement
      await recoverFromWater(bot)

      // Walk to tree via pathfinder
      console.log('[Wood] Walking to tree...')
      const dist = bot.entity.position.distanceTo(logBlock.position)

      if (dist > 3) {
        try {
          const movements = new Movements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(
            logBlock.position.x,
            logBlock.position.y,
            logBlock.position.z,
            2
          )
          await bot.pathfinder.goto(goal)
          console.log('[Wood] Arrived at tree')
        } catch (navErr) {
          console.log('[Wood] Pathfinder failed, trying manual approach')
          await bot.lookAt(logBlock.position)
          bot.setControlState('forward', true)
          await new Promise(r => setTimeout(r, Math.min(dist * 100, 3000)))
          bot.setControlState('forward', false)
        }
      }

      // Chop the tree completely (tree scanning)
      console.log('[Wood] Chopping tree completely...')
      bot.chat('🪓 Chopping tree...')

      // Water recovery before starting chopping
      await recoverFromWater(bot)

      const treeLogs = findConnectedLogs(bot, logBlock, radius)
      console.log(`[Wood] Tree has ${treeLogs.length} logs`)

      if (treeLogs.length === 0) {
        console.log('[Wood] No logs found to chop')
        break
      }

      // Sort from top to bottom
      treeLogs.sort((a, b) => b.position.y - a.position.y)

      for (const log of treeLogs) {
        if (collected >= maxBlocks) {
          console.log('[Wood] Reached max blocks limit')
          break
        }

        const emptySlots = bot.inventory.emptySlotCount()
        if (emptySlots < inventoryBufferSlots) {
          console.log(
            `[Wood] Inventory low on space (${emptySlots} slots). Stopping log chopping loop.`
          )
          bot.chat('🎒 Inventory full, stopping harvest')
          break
        }

        try {
          // Water safety check before each log
          await recoverFromWater(bot)
          
          // If axe disappeared mid-run (broken or used up), recraft
          const haveAxe = await ensureBestAxeEquipped(bot)
          if (!haveAxe) {
            const restored = await ensureAxeMidRun(bot, radius)
            if (!restored) {
              console.log('[Wood] Could not restore axe, abort tree')
              break
            }
          }
          // Recover from water if needed during tree processing
          await recoverFromWater(bot)
          // Always re-equip axe at start of each log iteration
          await ensureBestAxeEquipped(bot)

          console.log(
            `[Wood] Chopping log at ${log.position.x}, ${log.position.y}, ${log.position.z}`
          )

          const logDist = bot.entity.position.distanceTo(log.position)
          if (logDist > 4) {
            console.log('[Wood] Moving closer to log...')
            try {
              const movements = new Movements(bot)
              bot.pathfinder.setMovements(movements)
              const goal = new goals.GoalNear(
                log.position.x,
                log.position.y,
                log.position.z,
                3
              )
              await bot.pathfinder.goto(goal)
              // Water safety after navigation
              await recoverFromWater(bot)
              // After movement, re-confirm axe (movement or planting may have changed held item)
              await ensureBestAxeEquipped(bot)
            } catch (navErr) {
              console.log('[Wood] Could not navigate to log:', navErr.message)
              continue
            }
          }

          const currentBlock = bot.blockAt(log.position)
          if (!currentBlock || !currentBlock.name || !currentBlock.name.includes('log')) {
            console.log('[Wood] Log no longer exists')
            continue
          }

          try { bot._isDigging = true } catch (e) {}
          // Final pre-dig axe check (handles any last-second equip changes)
          await ensureBestAxeEquipped(bot)
          await bot.dig(currentBlock)
          collected++
          console.log(`[Wood] Chopped log ${collected}/${maxBlocks}`)
          // Delay collection until entire tree is finished (no per-log pickup)
          await new Promise(r => setTimeout(r, 200))
        } catch (digErr) {
          console.log('[Wood] Error chopping log:', digErr.message)
          collected++
        } finally {
          try { bot._isDigging = false } catch (e) {}
        }
      }

      // Store axe before final collection
      const currentAxe = bot.heldItem

      // Water safety before collection
      await recoverFromWater(bot)

      // Final collection pass for any missed items (adaptive, non-blocking)
      console.log('[Wood] Final collection pass...')
      console.log('[Wood] Final collection pass...')
      // Keep stuck detection ON; only briefly pause during the first short wait to avoid false stuck
      const prevTaskFlag = bot.isDoingTask
      bot.isDoingTask = false
      await new Promise(r => setTimeout(r, 400))
      bot.isDoingTask = prevTaskFlag

      // Adaptive loop: up to 3 short cycles, stop early if no new items
      let previousInvSignature = bot.inventory.items().map(i => i.type + ':' + i.count).join('|')
      for (let cycle = 0; cycle < 3; cycle++) {
        await recoverFromWater(bot)
        await collectNearbyItems(bot, 16)
        await new Promise(r => setTimeout(r, 900))
        const newSignature = bot.inventory.items().map(i => i.type + ':' + i.count).join('|')
        if (newSignature === previousInvSignature) {
          // No change this cycle -> break early
          break
        }
        previousInvSignature = newSignature
      }
      
      // Re-equip axe after final collection
      await ensureBestAxeEquipped(bot)

      treesChopped++
      
      // Plant saplings immediately after each tree (max 5)
      console.log('[Wood] Planting saplings at tree base...')
      // Disable stuck detection during precise placement to avoid jitter
      const prevTaskFlag2 = bot.isDoingTask; bot.isDoingTask = false
      try {
        await plantSaplingAtTreeBase(bot, treeBase, plantedSaplingPositions, { minSaplingSpacing })
      } finally { bot.isDoingTask = prevTaskFlag2 }

      // Ensure axe is equipped before moving to next tree
      console.log('[Wood] Re-equipping axe for next tree...')
      await ensureBestAxeEquipped(bot)

      const inventorySpace = bot.inventory.emptySlotCount()
      console.log(`[Wood] Inventory has ${inventorySpace} empty slots`)

      if (inventorySpace < 5) {
        console.log('[Wood] Inventory nearly full, stopping')
        bot.chat('🎒 Inventory full, stopping harvest')
        break
      }
    }

    console.log(`[Wood] Harvest complete: ${collected} logs collected, ${treesChopped} trees chopped`)
    bot.chat(`✅ Harvest complete: ${collected} logs collected`)
    
    // Disable stuck detection when task complete
    bot.isDoingTask = false
    
    return collected
  } catch (error) {
    console.error('[Wood] Harvest error:', error)
    bot.chat(`❌ Harvest error: ${error.message}`)
    
    // Disable stuck detection on error too
    bot.isDoingTask = false
    
    return collected
  }
}

module.exports = {
  harvestWood,
  findConnectedLogs,
  replantSapling,
  collectNearbyItems,
  plantSaplingAtTreeBase,
  plantSaplingsAtTreeBases,
  detectTreeTypeAtBase,
  findPlantingSpotNearBase
}
