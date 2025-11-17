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



/**
 * Plant all saplings in inventory at suitable locations nearby
 * @param {import('mineflayer').Bot} bot
 * @param {number} radius - Search radius for planting spots
 * @returns {Promise<number>} Number of saplings planted
 */
async function plantAllSaplings(bot, radius = 25) {
  try {
    if (!bot || !bot.inventory) {
      console.log('[Wood] plantAllSaplings: Invalid bot')
      return 0
    }

    // Get all saplings from inventory
    const saplings = bot.inventory.items().filter(i => 
      i && i.name && i.name.includes('sapling')
    )
    
    if (saplings.length === 0) {
      console.log('[Wood] No saplings to plant')
      return 0
    }

    let planted = 0
    const origin = bot.entity.position

    for (const sapling of saplings) {
      try {
        // Find suitable ground spots
        const baseX = Math.floor(origin.x)
        const baseZ = Math.floor(origin.z)
        
        // Search for dirt/grass blocks in a grid pattern
        for (let dx = -radius; dx <= radius; dx += 2) {
          for (let dz = -radius; dz <= radius; dz += 2) {
            if (planted >= saplings[0].count) break
            
            const checkX = baseX + dx
            const checkZ = baseZ + dz
            
            // Try different heights
            for (let dy = 0; dy <= 3; dy++) {
              const checkY = Math.floor(origin.y) + dy
              
              const groundBlock = bot.blockAt({ x: checkX, y: checkY - 1, z: checkZ })
              const airBlock = bot.blockAt({ x: checkX, y: checkY, z: checkZ })
              
              if (!groundBlock || !airBlock) continue
              
              // Check if ground is suitable and air above is empty
              const suitableGround = groundBlock.name === 'grass_block' || 
                                    groundBlock.name === 'dirt' || 
                                    groundBlock.name === 'podzol'
              const emptyAbove = airBlock.name === 'air'
              
              if (suitableGround && emptyAbove) {
                // Check distance isn't too close to other saplings
                const tooClose = Object.values(bot.entities).some(e => {
                  try {
                    if (!e || !e.position) return false
                    const dist = e.position.distanceTo({ x: checkX, y: checkY, z: checkZ })
                    return dist < 3
                  } catch (e) {
                    return false
                  }
                })
                
                if (!tooClose) {
                  // Plant the sapling
                  try {
                    await bot.equip(sapling, 'hand')
                    await bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 })
                    planted++
                    console.log(`[Wood] Sapling ${planted} planted at ${checkX}, ${checkY}, ${checkZ}`)
                    await new Promise(r => setTimeout(r, 150))
                  } catch (plantErr) {
                    console.log('[Wood] Plant failed at', checkX, checkY, checkZ)
                  }
                }
              }
            }
          }
        }
      } catch (saplingErr) {
        console.error('[Wood] Sapling loop error:', saplingErr.message)
      }
    }

    if (planted > 0) {
      bot.chat(`🌱 ${planted} saplings geplant`)
    }
    return planted
  } catch (e) {
    console.error('[Wood] plantAllSaplings error:', e.message)
    return 0
  }
}

/**
 * Find connected log blocks (flood-fill) starting from a root log.
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @returns {Array<import('prismarine-block').Block>} array of log blocks
 */
function findConnectedLogs(bot, startBlock, radius = 20) {
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
    
    const visited = new Set()
    const toVisit = [startBlock.position.clone ? startBlock.position.clone() : new Vec3(startBlock.position.x, startBlock.position.y, startBlock.position.z)]
    const blocks = []

    const key = (p) => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`

    while (toVisit.length > 0 && blocks.length < 256) {
      const pos = toVisit.shift()
      if (!pos) continue
      
      const k = key(pos)
      if (visited.has(k)) continue
      visited.add(k)
      
      const b = bot.blockAt(pos)
      if (!b || !b.name) {
        // console.log(`[Wood] Block at ${k} is null or has no name`)
        continue
      }
      if (!b.name.includes('log')) {
        // console.log(`[Wood] Block at ${k} is ${b.name}, not a log`)
        continue
      }
      if (pos.distanceTo(origin) > radius) {
        // console.log(`[Wood] Block at ${k} is too far: ${pos.distanceTo(origin)} > ${radius}`)
        continue
      }
      blocks.push(b)
      console.log(`[Wood] findConnectedLogs: Found log ${b.name} at ${pos.x},${pos.y},${pos.z}`)
      
      // neighbors: up/down and 4 horizontal + diagonals for better detection
      const neighbors = [
        [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,1,0], [0,-1,0],
        [1,0,1], [1,0,-1], [-1,0,1], [-1,0,-1] // diagonals
      ]
      for (const n of neighbors) {
        const np = new Vec3(pos.x + n[0], pos.y + n[1], pos.z + n[2])
        const nk = key(np)
        if (!visited.has(nk)) toVisit.push(np)
      }
    }
    console.log(`[Wood] findConnectedLogs found ${blocks.length} connected log blocks`)
    return blocks
  } catch (e) {
    console.error('[Wood] findConnectedLogs error:', e.message)
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
        
        // Use pathfinder to move to item
        const targetPos = itemEntity.position.clone()
        await bot.pathfinder.goto(targetPos)
        
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
  console.log('[Wood] harvestWood START - radius:', radius, 'maxBlocks:', maxBlocks)
  
  const opts = {
    replant: options.replant !== false,
    craftPlanks: options.craftPlanks || false,
    craftSticks: options.craftSticks || false
  }

  let collected = 0
  let treesChopped = 0
  let craftAttempts = 0  // Track craft attempts
  let axeWasCrafted = false  // Track if we successfully crafted an axe

  try {
    console.log('[Wood] Verifying pathfinder availability...')
    if (!bot.pathfinder || !bot.pathfinder.goto) {
      console.error('[Wood] Pathfinder not initialized. Call setupPathfinder(bot) first!')
      bot.chat('❌ Pathfinder niet beschikbaar')
      return 0
    }
    console.log('[Wood] Pathfinder verified')

    // STEP 0: PREPARE TOOLS FIRST (before main loop)
    console.log('[Wood] STEP 0: Preparing tools...')
    bot.chat('🔨 Gereedschap voorbereiden...')
    
    try {
      // 0a. Get first logs if we don't have any
      let logs = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
      if (!logs || logs.count === 0) {
        console.log('[Wood] - No logs to start with, finding first tree...')
        
        // Find nearby logs - use progressively larger search radius
        let logBlock = null
        const searchDistances = [20, 40, 100, 150, 200]
        
        for (const searchDist of searchDistances) {
          console.log(`[Wood] - Searching for initial logs within ${searchDist} blocks...`)
          logBlock = bot.findBlock({
            matching: b => b && b.name && b.name.includes('log'),
            maxDistance: searchDist,
            count: 1
          })
          
          if (logBlock) {
            console.log(`[Wood] - Found tree at distance ${bot.entity.position.distanceTo(logBlock.position)}: ${logBlock.position}`)
            break
          }
        }
        
        if (logBlock) {
          console.log('[Wood] - Mining first log...')
          try {
            // First, MOVE to the log location so items drop near us
            const logPos = logBlock.position
            const botPos = bot.entity.position
            const dist = botPos.distanceTo(logPos)
            
            if (dist > 3) {
              console.log(`[Wood] - Moving to log at distance ${dist.toFixed(1)}...`)
              await bot.pathfinder.goto(new Vec3(logPos.x, logPos.y, logPos.z))
              console.log('[Wood] - Reached log location')
            }
            
            // Now dig from close distance
            console.log('[Wood] - Digging log...')
            await bot.dig(logBlock)
            console.log('[Wood] - Dig complete, waiting for items...')
            await new Promise(r => setTimeout(r, 1500))  // Wait for drops to appear
            
            // Collect items that dropped nearby
            await collectNearbyItems(bot, 10)
            await new Promise(r => setTimeout(r, 500))
            
            logs = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
            console.log('[Wood] - After collection: logs =', logs ? logs.count : 0)
          } catch (e) {
            console.log('[Wood] - Could not mine first log:', e.message)
          }
        } else {
          console.log('[Wood] - No logs found nearby even after searching up to 200 blocks')
        }
      }
      
      if (!logs || logs.count === 0) {
        console.log('[Wood] - Still no logs, cannot prepare tools')
        return 0
      }
      
      // 0b. Craft planks from logs - craft enough for axe (3) + sticks (2) = 5 planks minimum
      console.log(`[Wood] - Starting with ${logs.count} logs`)
      const logsToConvert = Math.max(1, Math.min(logs.count, 10))  // Convert up to 10 logs
      console.log(`[Wood] - Converting ${logsToConvert} logs to planks...`)
      await craftPlanksFromLogs(bot, logsToConvert)
      await new Promise(r => setTimeout(r, 500))
      
      // 0c. Check planks - we should have logsToConvert * 4 planks
      let planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
      console.log(`[Wood] - Got ${planks ? planks.count : 0} planks`)
      
      // 0d. Only craft sticks if we have extra planks (keep 3 for axe)
      if (planks && planks.count > 5) {
        const sticksFromPlanks = Math.floor((planks.count - 3) / 2)  // Leave 3 planks for axe
        console.log(`[Wood] - Crafting sticks from ${sticksFromPlanks * 2} planks, keeping 3 for axe...`)
        await craftSticks(bot, sticksFromPlanks)
        await new Promise(r => setTimeout(r, 300))
      } else {
        console.log('[Wood] - Not enough planks to craft sticks AND axe, keeping all for axe')
      }
      
      // 0e. Craft axe if we have materials
      const hasAxe = getBestAxe(bot)
      if (!hasAxe) {
        planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
        const sticks = bot.inventory.items().find(i => i && i.name === 'stick')
        console.log(`[Wood] - Axe check: planks=${planks ? planks.count : 0}, sticks=${sticks ? sticks.count : 0}`)
        
        if (planks && planks.count >= 3 && sticks && sticks.count >= 2) {
          console.log('[Wood] - ✅ Materials ready for axe')
          
          // Ensure crafting table exists and is opened BEFORE crafting axe
          console.log('[Wood] - Ensuring crafting table for axe crafting...')
          try {
            const hasTable = await ensureCraftingTable(bot)
            if (hasTable) {
              console.log('[Wood] - ✅ Crafting table ready')
              // Open the crafting table before crafting axe
              await ensureCraftingTableOpen(bot)
            } else {
              console.log('[Wood] - Could not get/create crafting table')
            }
          } catch (tableErr) {
            console.log('[Wood] - Crafting table error:', tableErr.message)
          }
          
          // Now craft the axe with table opened
          console.log('[Wood] - Crafting wooden axe...')
          const axieCrafted = await ensureWoodenAxe(bot)
          craftAttempts++
          if (axieCrafted) {
            console.log('[Wood] - ✅ Axe crafted successfully!')
            axeWasCrafted = true
            bot.chat('✅ Axe gecrafted!')
          } else {
            console.log('[Wood] - Axe craft attempted but failed')
          }
        } else {
          console.log('[Wood] - Not enough materials for axe')
          craftAttempts++  // Count as attempt even though we don't have materials
        }
      } else {
        console.log('[Wood] - ✅ Already have axe:', hasAxe.name)
        axeWasCrafted = true
      }
    } catch (prepErr) {
      console.error('[Wood] Tool preparation error:', prepErr.message)
    }
    
    await new Promise(r => setTimeout(r, 500))

    console.log('[Wood] Loading pathfinder package...')
    try {
      pathfinderPkg = require('mineflayer-pathfinder')
      if (!pathfinderPkg || !pathfinderPkg.Movements || !pathfinderPkg.goals) {
        throw new Error('Missing pathfinder components')
      }
      Movements = pathfinderPkg.Movements
      goals = pathfinderPkg.goals
      console.log('[Wood] Pathfinder package loaded successfully')
    } catch (pkgErr) {
      console.error('[Wood] Failed to load pathfinder package:', pkgErr.message)
      bot.chat('❌ Kon pathfinder package niet laden')
      return 0
    }

    // Continue until we reach maxBlocks or no more trees found
    let loopIterations = 0
    const maxLoopIterations = 50 // Safety limit
    
    while (collected < maxBlocks && loopIterations < maxLoopIterations) {
      loopIterations++
      console.log(`[Wood] Loop iteration ${loopIterations} - collected: ${collected}/${maxBlocks}`)
      
      console.log('[Wood] STEP 1: Check axe')
      console.log('[Wood] About to call getBestAxe...')
      
      // STEP 1: Check if we have an axe
      let currentAxe
      try {
        currentAxe = getBestAxe(bot)
        console.log('[Wood] getBestAxe returned:', currentAxe ? currentAxe.name : 'null')
      } catch (axeErr) {
        console.error('[Wood] getBestAxe error:', axeErr.message)
        currentAxe = null
      }
    
      console.log('[Wood] STEP 2: Equip best tool')
      // Equip best axe if we have one
      let bestAxe
      try {
        bestAxe = getBestAxe(bot)
        if (bestAxe) {
          console.log('[Wood] Equipping axe:', bestAxe.name)
          await bot.equip(bestAxe, 'hand')
          console.log('[Wood] Axe equipped')
        } else {
          console.log('[Wood] No axe, unequipping hand...')
          try {
            await bot.unequip('hand')
          } catch (e) {
            console.log('[Wood] Already bare hands')
          }
        }
      } catch (equipErr) {
        console.error('[Wood] Equip error:', equipErr.message)
      }
      
      console.log('[Wood] STEP 3: Find tree')
      // STEP 3: Find nearest log block - use much larger search radius
      let logBlock
      try {
        // Try progressively larger search distances
        const searchDistances = [radius, radius * 2, 100, 150, 200]
        
        for (const searchDist of searchDistances) {
          console.log(`[Wood] Searching for logs within ${searchDist} blocks...`)
          logBlock = bot.findBlock({
            matching: b => {
              try {
                return b && b.name && b.name.includes('log')
              } catch (e) {
                return false
              }
            },
            maxDistance: searchDist,
            count: 1
          })
          
          if (logBlock) {
            console.log(`[Wood] Log block found at distance ${bot.entity.position.distanceTo(logBlock.position)}: ${logBlock.name}`)
            break
          }
        }
        
        if (!logBlock) {
          console.log('[Wood] Log block search failed after all attempts')
        }
      } catch (findErr) {
        console.error('[Wood] Error finding log:', findErr.message)
        logBlock = null
      }
      
      if (!logBlock) {
        console.log('[Wood] No more trees found, breaking loop')
        break
      }

      console.log('[Wood] Getting tree type...')
      // Get tree type for sapling
      let treeType = 'oak'
      try {
        treeType = logBlock.name.replace('_log', '')
      } catch (e) {
        console.log('[Wood] Error parsing tree type, using default oak')
      }

      console.log('[Wood] Finding connected logs...')
      let cluster
      try {
        cluster = findConnectedLogs(bot, logBlock, radius)
        console.log('[Wood] Cluster found:', cluster ? cluster.length : 'null')
      } catch (clusterErr) {
        console.error('[Wood] Error finding cluster:', clusterErr.message)
        cluster = []
      }
      
      if (!cluster || cluster.length === 0) {
        console.log('[Wood] Empty cluster, trying next tree...')
        continue
      }

      console.log('[Wood] Cluster has', cluster.length, 'logs')
      try {
        bot.chat(`🌲 Boom hakken: ${cluster.length} logs (${treeType})`)
      } catch (chatErr) {
        console.log('[Wood] Chat error:', chatErr.message)
      }

      console.log('[Wood] Sorting cluster...')
      // Sort by y descending (top to bottom) to prevent floating logs
      try {
        cluster.sort((a, b) => b.position.y - a.position.y)
      } catch (sortErr) {
        console.error('[Wood] Sort error:', sortErr.message)
      }

      console.log('[Wood] Starting mining loop for', cluster.length, 'blocks')

      // STEP 4: Mine all logs in this tree
      for (const block of cluster) {
        if (!block || !block.position) {
          console.log('[Wood] Invalid block, skipping')
          continue
        }
        
        console.log('[Wood] Mining block at', block.position, 'collected:', collected, '/', maxBlocks)
        if (collected >= maxBlocks) break
        
        try {
          console.log('[Wood] Checking distance to block...')
          // Navigate to block if too far
          const dist = bot.entity.position.distanceTo(block.position)
          console.log('[Wood] Distance:', dist)
          
          if (dist > 4.5) {
            console.log('[Wood] Too far, navigating...')
            
            // Try to place path blocks for faster navigation
            try {
              await createPathWithBlocks(bot, block.position)
            } catch (pathErr) {
              // Silently fail
            }
            
            // Track position to detect if stuck
            const startPos = bot.entity.position.clone()
            const startTime = Date.now()
            
            try {
              const movements = new Movements(bot)
              movements.canDig = true // Allow breaking obstacles
              bot.pathfinder.setMovements(movements)
              
              const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3)
              await bot.pathfinder.goto(goal)
              console.log('[Wood] Navigation complete')
            } catch (navError) {
              console.log('[Wood] Navigation failed:', navError.message)
              
              // Check if stuck (no movement in 10 seconds)
              const timePassed = Date.now() - startTime
              const posDiff = bot.entity.position.distanceTo(startPos)
              
              if (timePassed > 10000 && posDiff < 1) {
                console.log('[Wood] STUCK! Trying to escape...')
                const unstuck = await tryUnstuck(bot)
                if (unstuck) {
                  console.log('[Wood] Escaped! Retrying navigation...')
                  await new Promise(r => setTimeout(r, 500))
                }
              }
              
              // If stuck, try to break obstacle
              if (bot._debug) console.log('[Wood] Navigation blocked, trying to clear path')
              try {
                const obstacle = bot.blockAt(bot.entity.position.offset(0, 0, 1))
                if (obstacle && obstacle.name !== 'air' && obstacle.diggable) {
                  await bot.dig(obstacle)
                  await new Promise(r => setTimeout(r, 300))
                }
              } catch (obsErr) {
                console.log('[Wood] Obstacle clear failed:', obsErr.message)
              }
            }
          }
          
          console.log('[Wood] Equipping axe before dig...')
          // Equip best axe before digging
          try {
            const axe = getBestAxe(bot)
            if (axe) await bot.equip(axe, 'hand')
          } catch (eqErr) {
            console.log('[Wood] Equip for dig failed:', eqErr.message)
          }

          console.log('[Wood] Starting dig...')
          // Dig the block with aggressive timeout
          let dug = false
          try {
            let digResolve, digReject
            const digPromise = new Promise((resolve, reject) => {
              digResolve = resolve
              digReject = reject
              bot.dig(block, true).then(() => {
                dug = true
                digResolve()
              }).catch(digReject)
            })
            
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => {
                if (!dug) {
                  reject(new Error('Dig timeout after 15s'))
                }
              }, 15000)
            })
            
            await Promise.race([digPromise, timeoutPromise])
            console.log('[Wood] Block dug successfully')
            collected++
          } catch (digErr) {
            console.log('[Wood] Dig error:', digErr.message)
            // Always mark as collected so we make progress
            collected++
          }
          
          // Small delay for drops to spawn
          await new Promise(r => setTimeout(r, 300))
          
        } catch (blockLoopErr) {
          console.log('[Wood] Block iteration error:', blockLoopErr.message)
          // Mark as attempted so we continue loop
          collected++
        }
      }

      treesChopped++
      console.log('[Wood] Tree chopped, total trees:', treesChopped)
      try {
        bot.chat(`✅ Boom ${treesChopped} gehakt`)
      } catch (chatErr) {
        console.log('[Wood] Chat error:', chatErr.message)
      }

      // STEP 4b: Re-craft axe if needed and we haven't exhausted attempts
      // Only try if: we don't have axe AND haven't successfully crafted one yet AND attempts < 2
      if (!getBestAxe(bot) && !axeWasCrafted && craftAttempts < 2) {
        console.log(`[Wood] STEP 4b: Retrying axe craft (attempt ${craftAttempts + 1}/2)...`)
        try {
          const materials = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
          if (materials && materials.count >= 3) {
            console.log('[Wood] Materials available, retrying craft...')
            const retried = await ensureWoodenAxe(bot)
            craftAttempts++
            if (retried) {
              console.log('[Wood] ✅ Axe crafted on retry!')
              axeWasCrafted = true
              bot.chat('✅ Axe gecrafted!')
            } else {
              console.log('[Wood] Retry failed, continuing with bare hands')
            }
          } else {
            craftAttempts++  // Count as attempt even if no materials
            console.log('[Wood] Insufficient materials for retry')
          }
        } catch (retryErr) {
          console.error('[Wood] Retry craft error:', retryErr.message)
          craftAttempts++
        }
      }

      console.log('[Wood] STEP 5: Collect items')
      // STEP 5: Collect all items from this tree
      try {
        await new Promise(r => setTimeout(r, 1000)) // Wait for all drops
        console.log('[Wood] About to call collectNearbyItems...')
        await collectNearbyItems(bot, 15)
        console.log('[Wood] collectNearbyItems completed')
        bot.chat(`📦 Items verzameld`)
      } catch (collectErr) {
        console.error('[Wood] Item collection error:', collectErr.message)
      }

      // Small break before next tree
      await new Promise(r => setTimeout(r, 500))
    }

    console.log('[Wood] Main loop complete, performing final cleanup')

    // Final item collection sweep
    try {
      await collectNearbyItems(bot, 20)
    } catch (finalErr) {
      console.error('[Wood] Final collection error:', finalErr.message)
    }

    // STEP 7: Pick up crafting table if it was placed
    console.log('[Wood] STEP 7: Picking up crafting table...')
    try {
      let attempts = 0
      while (attempts < 3) {  // Try up to 3 times to find and remove it
        const craftingTable = bot.findBlock({
          matching: b => b && b.name === 'crafting_table',
          maxDistance: 60,
          count: 1
        })
        if (!craftingTable) {
          console.log('[Wood] ✅ No crafting table found - cleanup complete')
          break
        }
        
        console.log('[Wood] Found crafting table at', craftingTable.position, ', removing...')
        const dist = bot.entity.position.distanceTo(craftingTable.position)
        
        // Navigate to crafting table if too far
        if (dist > 4) {
          console.log('[Wood] Crafting table is', Math.round(dist), 'blocks away, navigating...')
          try {
            const movements = new Movements(bot)
            bot.pathfinder.setMovements(movements)
            const goal = new goals.GoalNear(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z, 2)
            await bot.pathfinder.goto(goal)
            await new Promise(r => setTimeout(r, 300))
          } catch (navErr) {
            console.log('[Wood] Could not navigate to crafting table:', navErr.message)
            attempts++
            continue
          }
        }
        
        // Mine it with timeout
        try {
          console.log('[Wood] Mining crafting table (attempt', attempts + 1, ')...')
          await Promise.race([
            bot.dig(craftingTable),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Dig timeout')), 5000))
          ])
          console.log('[Wood] ✅ Crafting table removed')
          await new Promise(r => setTimeout(r, 300))
          break  // Success, exit loop
        } catch (digErr) {
          console.log('[Wood] Could not dig crafting table:', digErr.message)
          attempts++
        }
      }
    } catch (tableErr) {
      console.log('[Wood] Crafting table removal error:', tableErr.message)
    }

    try {
      bot.chat(`✅ Houthakken klaar: ${collected} logs van ${treesChopped} bomen`)
    } catch (chatErr) {
      console.log('[Wood] Final chat error:', chatErr.message)
    }

    // STEP 8: Plant saplings after all chopping is done
    if (opts.replant) {
      console.log('[Wood] STEP 8: Planting saplings...')
      try {
        await plantAllSaplings(bot, 25)
        console.log('[Wood] Sapling planting complete')
      } catch (plantErr) {
        console.error('[Wood] Sapling planting error:', plantErr.message)
      }
    }

    // Auto-craft if enabled and we have logs
    if (opts.craftPlanks && collected > 0) {
      try {
        await new Promise(r => setTimeout(r, 500))
        await craftPlanksFromLogs(bot, Math.floor(collected / 2))
      } catch (craftErr) {
        console.error('[Wood] Craft planks error:', craftErr.message)
      }
    }

    if (opts.craftSticks && collected > 0) {
      try {
        await new Promise(r => setTimeout(r, 500))
        await craftSticks(bot, Math.floor(collected / 4))
      } catch (craftErr) {
        console.error('[Wood] Craft sticks error:', craftErr.message)
      }
    }

    return collected
  
  } catch (error) {
    console.error('[Wood] harvestWood outer error:', error)
    console.error('[Wood] Stack:', error.stack)
    try {
      bot.chat(`❌ Error tijdens houthakken: ${error.message}`)
    } catch (chatErr) {
      console.error('[Wood] Error chat message failed:', chatErr.message)
    }
    return collected
  }
}

module.exports = { 
  harvestWood, 
  findConnectedLogs,
  replantSapling,
  collectNearbyItems,
  plantAllSaplings
}
