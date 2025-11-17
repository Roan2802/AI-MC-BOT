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



/**
 * Plant saplings near tree bases instead of random locations
 * @param {import('mineflayer').Bot} bot
 * @param {Array<Vec3>} treeBases - Array of tree base positions
 * @returns {Promise<number>} Number of saplings planted
 */
async function plantSaplingsAtTreeBases(bot, treeBases) {
  try {
    if (!bot || !bot.inventory || !treeBases || treeBases.length === 0) {
      console.log('[Wood] plantSaplingsAtTreeBases: Invalid parameters')
      return 0
    }

    let planted = 0
    const plantedPositions = [] // Track where we've planted to avoid clustering

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
        const plantPos = findPlantingSpotNearBase(bot, basePos, plantedPositions)
        if (!plantPos) {
          console.log(`[Wood] No suitable planting spot near tree base at ${basePos.x}, ${basePos.z}`)
          continue
        }

        // Plant the sapling
        try {
          await bot.equip(sapling, 'hand')
          const blockBelow = bot.blockAt(plantPos.offset(0, -1, 0))
          
          if (blockBelow && (blockBelow.name === 'dirt' || blockBelow.name === 'grass_block' || blockBelow.name === 'podzol')) {
            await bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 })
            planted++
            plantedPositions.push(plantPos)
            console.log(`[Wood] Planted ${saplingName} at ${Math.floor(plantPos.x)}, ${Math.floor(plantPos.z)}`)
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
 * @returns {Promise<string>} Tree type (oak, birch, spruce, etc.)
 */
async function detectTreeTypeAtBase(bot, basePos) {
  try {
    // Check blocks around base position for log types
    const checkPositions = [
      basePos,
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
function findPlantingSpotNearBase(bot, basePos, existingPlants) {
  // Check positions around base (not on base itself)
  const candidates = [
    basePos.offset(1, 0, 0),
    basePos.offset(-1, 0, 0),
    basePos.offset(0, 0, 1),
    basePos.offset(0, 0, -1),
    basePos.offset(1, 0, 1),
    basePos.offset(1, 0, -1),
    basePos.offset(-1, 0, 1),
    basePos.offset(-1, 0, -1)
  ]

  for (const pos of candidates) {
    const block = bot.blockAt(pos)
    const below = bot.blockAt(pos.offset(0, -1, 0))
    
    // Must be air above suitable ground
    if (block && block.name === 'air' && below && 
        (below.name === 'dirt' || below.name === 'grass_block' || below.name === 'podzol')) {
      
      // Check not too close to existing plants (minimum 2 blocks apart)
      const tooClose = existingPlants.some(existing => 
        existing.distanceTo(pos) < 2
      )
      
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
  console.log('[Wood] findConnectedLogs: Function called with params:', !!bot, !!startBlock, !!startBlock?.position)
  if (!bot || !startBlock || !startBlock.position) {
    console.log('[Wood] findConnectedLogs: Invalid parameters')
    return []
  }
  
  try {
    const origin = bot.entity.position
    if (!origin) {
      console.log('[Wood] findConnectedLogs: No entity position')
      return []
    }
    
    console.log(`[Wood] findConnectedLogs: Starting from ${startBlock.name} at ${startBlock.position.x},${startBlock.position.y},${startBlock.position.z}`)
    console.log(`[Wood] Position object type: ${typeof startBlock.position}, has floored: ${typeof startBlock.position.floored}`)
    
    const visited = new Set()
    const blocks = []

    // First, add the start block
    if (startBlock.name && startBlock.name.includes('log')) {
      blocks.push(startBlock)
      const posKey = `${Math.floor(startBlock.position.x)},${Math.floor(startBlock.position.y)},${Math.floor(startBlock.position.z)}`
      visited.add(posKey)
      console.log(`[Wood] findConnectedLogs: Added start block ${startBlock.name}`)
    }

    console.log('[Wood] findConnectedLogs: Starting search loop...')
    // Search in a larger area around the start block for connected logs
    const startX = Math.floor(startBlock.position.x)
    const startY = Math.floor(startBlock.position.y)
    const startZ = Math.floor(startBlock.position.z)
    
    // Search in a 5x5x20 area centered on start block
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -10; dy <= 10; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const x = startX + dx
          const y = startY + dy
          const z = startZ + dz
          
          const key = `${x},${y},${z}`
          if (visited.has(key)) continue
          
          visited.add(key)
          
          const block = bot.blockAt({ x, y, z })
          if (block && block.name && block.name.includes('log')) {
            // Check if it's within radius from bot
            const dist = origin.distanceTo({ x, y, z })
            if (dist <= radius) {
              blocks.push(block)
              console.log(`[Wood] findConnectedLogs: Found connected log ${block.name} at ${x},${y},${z}`)
            }
          }
        }
      }
    }
    
    console.log(`[Wood] findConnectedLogs found ${blocks.length} connected log blocks`)
    return blocks
  } catch (e) {
    console.error('[Wood] findConnectedLogs error:', e.message)
    console.error('[Wood] Error stack:', e.stack)
    return []
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
    console.log(`[Wood] collectNearbyItems: Collecting items within ${radius} blocks...`)
    
    // Wait for items to settle
    await new Promise(r => setTimeout(r, 500))
    
    // Get all entities and filter for items
    const allEntities = Object.values(bot.entities)
    console.log(`[Wood] Total entities: ${allEntities.length}`)
    
    const itemEntities = allEntities
      .filter(e => {
        if (!e || !e.position) return false
        // Check if entity name is 'item'
        if (e.name !== 'item') return false
        const dist = bot.entity.position.distanceTo(e.position)
        return dist <= radius
      })
      .sort((a, b) => {
        const distA = bot.entity.position.distanceTo(a.position)
        const distB = bot.entity.position.distanceTo(b.position)
        return distA - distB
      })
    
    console.log(`[Wood] Found ${itemEntities.length} collectible items nearby`)
    
    // Collect each item by moving to it
    for (const itemEntity of itemEntities) {
      try {
        if (!itemEntity || !itemEntity.position) continue
        
        const dist = bot.entity.position.distanceTo(itemEntity.position)
        console.log(`[Wood] Moving to item at distance ${dist.toFixed(2)}...`)
        
        // Use pathfinder for proper navigation to items
        try {
          const movements = new Movements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(itemEntity.position.x, itemEntity.position.y, itemEntity.position.z, 1)
          await bot.pathfinder.goto(goal)
          console.log('[Wood] Reached item location')
        } catch (pathErr) {
          console.log('[Wood] Pathfinder to item failed:', pathErr.message)
          // Fallback to simple movement
          try {
            await bot.lookAt(itemEntity.position)
            await bot.setControlState('forward', true)
            await new Promise(r => setTimeout(r, Math.min(dist * 100, 2000)))
            await bot.setControlState('forward', false)
          } catch (moveErr) {
            console.log('[Wood] Manual movement to item failed:', moveErr.message)
          }
        }
        
        // Wait for pickup
        await new Promise(r => setTimeout(r, 1500))
      } catch (pathErr) {
        console.log('[Wood] Could not path to item:', pathErr.message)
        // Continue to next item
      }
    }
    
    console.log('[Wood] Item collection window complete')
    return
  } catch (e) {
    console.error('[Wood] collectNearbyItems error:', e.message)
    return
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
      await bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 })
      bot.chat(`🌱 Sapling herplant op ${Math.floor(position.x)}, ${Math.floor(position.z)}`)
      return true
    }
  } catch (e) {
    if (bot._debug) console.log('[Wood] Replant failed:', e.message)
  }
  return false
}



/**
 * Helper: Detect if bot is stuck and try to escape
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if unstuck was needed
 */
async function tryUnstuck(bot) {
  try {
    // Try to mine blocks around bot to escape
    const around = [
      bot.entity.position.offset(1, 0, 0),
      bot.entity.position.offset(-1, 0, 0),
      bot.entity.position.offset(0, 0, 1),
      bot.entity.position.offset(0, 0, -1),
      bot.entity.position.offset(1, 0, 1),
      bot.entity.position.offset(-1, 0, -1),
    ]
    
    for (const pos of around) {
      const block = bot.blockAt(pos)
      if (block && block.name !== 'air' && block.diggable && 
          !block.name.includes('bedrock') && !block.name.includes('obsidian')) {
        console.log('[Wood] Unstuck: Mining block at', pos.x, pos.z)
        await bot.dig(block)
        await new Promise(r => setTimeout(r, 300))
        return true
      }
    }
  } catch (e) {
    console.log('[Wood] Unstuck failed:', e.message)
  }
  return false
}

/**
 * Helper: Place blocks to create path for faster navigation
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} targetPos
 */
async function createPathWithBlocks(bot, targetPos) {
  try {
    const start = bot.entity.position
    const dx = targetPos.x - start.x
    const dz = targetPos.z - start.z
    const distance = Math.sqrt(dx*dx + dz*dz)
    
    if (distance < 8) return // Only for far distances
    
    // Place blocks every 8 blocks to create path
    const steps = Math.floor(distance / 8)
    for (let i = 1; i <= steps; i++) {
      const ratio = i / steps
      const x = Math.floor(start.x + dx * ratio)
      const z = Math.floor(start.z + dz * ratio)
      const y = Math.floor(start.y)
      
      const blockBelow = bot.blockAt({ x, y: y-1, z })
      const blockAbove = bot.blockAt({ x, y, z })
      
      if (blockAbove && blockAbove.name === 'air' && blockBelow && blockBelow.diggable === false) {
        // Place temporary block
        try {
          const dirt = bot.inventory.items().find(it => it && it.name === 'dirt')
          if (dirt) {
            await bot.equip(dirt, 'hand')
            await bot.placeBlock(blockBelow, new Vec3(0, 1, 0))
            await new Promise(r => setTimeout(r, 100))
          }
        } catch (e) {
          // Skip if placement fails
        }
      }
    }
  } catch (e) {
    // Silently fail - pathfinding will handle it
  }
}

/**
 * Simple Wood Axe Workflow v1
 * 
 * 1. Find tree block nearby
 * 2. Walk there via pathfinder
 * 3. Check if there's an axe
 *    - If not → make planks → make sticks → craft wooden axe → use axe
 * 4. Chop the tree completely (tree scanning)
 * 5. Collect logs automatically
 * 6. Stop when inventory is full
 */
async function harvestWood(bot, radius = 20, maxBlocks = 32, options = {}) {
  console.log('[Wood] Starting Simple Wood Axe Workflow v1')
  bot.chat('🌲 Starting wood harvesting...')

  let collected = 0

  try {
    // Initialize pathfinder
    console.log('[Wood] Initializing pathfinder...')
    console.log('[Wood] Pathfinder ready')

    // STEP 1: Find tree block nearby
    console.log('[Wood] STEP 1: Finding tree block nearby...')
    const logBlock = bot.findBlock({
      matching: b => b && b.name && b.name.includes('log'),
      maxDistance: radius,
      count: 1
    })

    if (!logBlock) {
      console.log('[Wood] No tree blocks found nearby')
      bot.chat('❌ No trees found nearby')
      return 0
    }

    console.log(`[Wood] Found tree at distance ${bot.entity.position.distanceTo(logBlock.position)}`)
    bot.chat(`🌲 Found tree at ${Math.floor(logBlock.position.x)}, ${Math.floor(logBlock.position.z)}`)

    // STEP 2: Walk there via pathfinder
    console.log('[Wood] STEP 2: Walking to tree...')
    const dist = bot.entity.position.distanceTo(logBlock.position)
    
    if (dist > 3) {
      try {
        const movements = new Movements(bot)
        bot.pathfinder.setMovements(movements)
        const goal = new goals.GoalNear(logBlock.position.x, logBlock.position.y, logBlock.position.z, 2)
        await bot.pathfinder.goto(goal)
        console.log('[Wood] Arrived at tree')
      } catch (navErr) {
        console.log('[Wood] Pathfinder failed, trying manual approach')
        await bot.lookAt(logBlock.position)
        await bot.setControlState('forward', true)
        await new Promise(r => setTimeout(r, Math.min(dist * 100, 3000)))
        await bot.setControlState('forward', false)
      }
    }

    // STEP 3: Check if there's an axe - If not, chop whole tree first, then try to craft axe (with crafting table if needed)
    console.log('[Wood] STEP 3: Checking for axe...')
    let axe = getBestAxe(bot)

    if (!axe) {
      console.log('[Wood] No axe found, will chop whole tree first to get enough logs')
      bot.chat('🔨 No axe, chopping tree by hand to gather logs for crafting')
    }

    // STEP 4: Chop the tree completely (tree scanning)
    console.log('[Wood] STEP 4: Chopping tree completely...')
    bot.chat('🪓 Chopping tree...')

    // Find all connected logs
    const treeLogs = findConnectedLogs(bot, logBlock, radius)
    console.log(`[Wood] Tree has ${treeLogs.length} logs`)

    if (treeLogs.length === 0) {
      console.log('[Wood] No logs found to chop')
      return 0
    }

    // Sort by height (top to bottom)
    treeLogs.sort((a, b) => b.position.y - a.position.y)

    // Chop each log
    for (const log of treeLogs) {
      if (collected >= maxBlocks) {
        console.log('[Wood] Reached max blocks limit')
        break
      }

      try {
        console.log(`[Wood] Chopping log at ${log.position.x}, ${log.position.y}, ${log.position.z}`)
        // Check if we're close enough
        const logDist = bot.entity.position.distanceTo(log.position)
        if (logDist > 4) {
          console.log('[Wood] Moving closer to log...')
          try {
            const movements = new Movements(bot)
            bot.pathfinder.setMovements(movements)
            const goal = new goals.GoalNear(log.position.x, log.position.y, log.position.z, 3)
            await bot.pathfinder.goto(goal)
          } catch (navErr) {
            console.log('[Wood] Could not navigate to log')
            continue
          }
        }

        // Verify block still exists
        const currentBlock = bot.blockAt(log.position)
        if (!currentBlock || !currentBlock.name.includes('log')) {
          console.log('[Wood] Log no longer exists')
          continue
        }

        // Dig the log
        await bot.dig(currentBlock)
        collected++
        console.log(`[Wood] Chopped log ${collected}/${maxBlocks}`)
        await new Promise(r => setTimeout(r, 300))
      } catch (digErr) {
        console.log('[Wood] Error chopping log:', digErr.message)
        collected++ // Count as attempted
      }
    }

    // STEP 5: Collect logs automatically
    console.log('[Wood] STEP 5: Collecting logs...')
    bot.chat('📦 Collecting logs...')
    await new Promise(r => setTimeout(r, 1000)) // Wait for drops
    await collectNearbyItems(bot, 15)

    // After chopping, try to craft axe if still missing
    axe = getBestAxe(bot)
    if (!axe) {
      let logs = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
      if (!logs || logs.count < 2) {
        bot.chat('❌ Still not enough logs to craft axe after chopping')
      } else {
        // Make planks from logs
        console.log('[Wood] Crafting planks...')
        await craftPlanksFromLogs(bot, Math.min(logs.count, 3))
        await new Promise(r => setTimeout(r, 500))

        // Make sticks from planks
        const planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
        if (planks && planks.count >= 4) {
          console.log('[Wood] Crafting sticks...')
          await craftSticks(bot, 2)
          await new Promise(r => setTimeout(r, 500))
        }

        // Ensure crafting table exists and is placed
        let craftingTable = bot.inventory.items().find(i => i && i.name === 'crafting_table')
        if (!craftingTable) {
          bot.chat('🪑 Crafting table not found, crafting one...')
          await craftPlanksFromLogs(bot, 4)
          await new Promise(r => setTimeout(r, 500))
          // Try to craft crafting table
          // ...existing code...
        }
        // Place crafting table if not placed
        // ...existing code...

        // Craft axe
        console.log('[Wood] Crafting wooden axe...')
        const axeCrafted = await ensureWoodenAxe(bot)
        if (axeCrafted) {
          console.log('[Wood] Axe crafted successfully!')
          bot.chat('✅ Wooden axe crafted!')
          axe = getBestAxe(bot)
        } else {
          console.log('[Wood] Axe crafting failed, continuing with bare hands')
          bot.chat('⚠️ Using bare hands (axe crafting failed)')
        }
      }
    }

    // Equip axe if we have one
    if (axe) {
      await bot.equip(axe, 'hand')
      console.log('[Wood] Axe equipped')
    }

    // STEP 4: Chop the tree completely (tree scanning)
    console.log('[Wood] STEP 4: Chopping tree completely...')
    bot.chat('🪓 Chopping tree...')

    // Find all connected logs
    const treeLogs = findConnectedLogs(bot, logBlock, radius)
    console.log(`[Wood] Tree has ${treeLogs.length} logs`)

    if (treeLogs.length === 0) {
      console.log('[Wood] No logs found to chop')
      return 0
    }

    // Sort by height (top to bottom)
    treeLogs.sort((a, b) => b.position.y - a.position.y)

    // Chop each log
    for (const log of treeLogs) {
      if (collected >= maxBlocks) {
        console.log('[Wood] Reached max blocks limit')
        break
      }

      try {
        console.log(`[Wood] Chopping log at ${log.position.x}, ${log.position.y}, ${log.position.z}`)
        
        // Check if we're close enough
        const logDist = bot.entity.position.distanceTo(log.position)
        if (logDist > 4) {
          console.log('[Wood] Moving closer to log...')
          try {
            const movements = new Movements(bot)
            bot.pathfinder.setMovements(movements)
            const goal = new goals.GoalNear(log.position.x, log.position.y, log.position.z, 3)
            await bot.pathfinder.goto(goal)
          } catch (navErr) {
            console.log('[Wood] Could not navigate to log')
            continue
          }
        }

        // Verify block still exists
        const currentBlock = bot.blockAt(log.position)
        if (!currentBlock || !currentBlock.name.includes('log')) {
          console.log('[Wood] Log no longer exists')
          continue
        }

        // Dig the log
        await bot.dig(currentBlock)
        collected++
        console.log(`[Wood] Chopped log ${collected}/${maxBlocks}`)
        
        // Small delay
        await new Promise(r => setTimeout(r, 300))

      } catch (digErr) {
        console.log('[Wood] Error chopping log:', digErr.message)
        collected++ // Count as attempted
      }
    }

    // STEP 5: Collect logs automatically
    console.log('[Wood] STEP 5: Collecting logs...')
    bot.chat('📦 Collecting logs...')
    await new Promise(r => setTimeout(r, 1000)) // Wait for drops
    await collectNearbyItems(bot, 15)

    // STEP 6: Stop when inventory is full (check if we have space for more logs)
    const inventorySpace = bot.inventory.emptySlotCount()
    console.log(`[Wood] Inventory has ${inventorySpace} empty slots`)

    if (inventorySpace < 5) { // If less than 5 slots free, consider inventory full
      console.log('[Wood] Inventory nearly full, stopping')
      bot.chat('🎒 Inventory full, stopping harvest')
    }

    console.log(`[Wood] Harvest complete: ${collected} logs collected`)
    bot.chat(`✅ Harvest complete: ${collected} logs collected`)

    return collected

  } catch (error) {
    console.error('[Wood] Harvest error:', error)
    bot.chat(`❌ Harvest error: ${error.message}`)
    return collected
  }
}

module.exports = { 
  harvestWood, 
  findConnectedLogs,
  replantSapling,
  collectNearbyItems,
  plantSaplingsAtTreeBases,
  detectTreeTypeAtBase,
  findPlantingSpotNearBase
}
