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
const { getBestAxe, ensureToolFor } = require('./crafting.js')

/**
 * Ensure crafting table is placed nearby
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if crafting table available
 */
async function ensureCraftingTable(bot) {
  try {
    if (!bot) return false
    
    // Check if crafting table already nearby
    const craftingTable = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 5,
      count: 1
    })
    
    if (craftingTable) {
      console.log('[Wood] Crafting table found nearby')
      return true
    }
    
    // Try to place one if we have materials
    const planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
    if (!planks || planks.count < 4) {
      console.log('[Wood] Not enough planks for crafting table')
      return false
    }
    
    console.log('[Wood] Crafting table not found, placing one...')
    
    // Place crafting table
    const groundBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0))
    if (groundBlock && groundBlock.name !== 'air') {
      try {
        await bot.equip(planks, 'hand')
        // Recipe: 4 planks = 1 crafting table
        const recipes = bot.recipesFor(bot.registry.itemsByName['crafting_table'].id, null, 1, null)
        if (recipes && recipes.length > 0) {
          await bot.craft(recipes[0], 1)
          console.log('[Wood] Crafting table crafted')
          await new Promise(r => setTimeout(r, 300))
          
          // Place it
          const craftingTableItem = bot.inventory.items().find(i => i && i.name === 'crafting_table')
          if (craftingTableItem) {
            await bot.equip(craftingTableItem, 'hand')
            await bot.placeBlock(groundBlock, new bot.Vec3(1, 0, 0))
            console.log('[Wood] Crafting table placed')
            await new Promise(r => setTimeout(r, 300))
            return true
          }
        }
      } catch (e) {
        console.log('[Wood] Failed to craft/place table:', e.message)
      }
    }
    
    return false
  } catch (e) {
    console.error('[Wood] ensureCraftingTable error:', e.message)
    return false
  }
}

/**
 * Ensure wooden axe is available (craft if needed)
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if axe available
 */
async function ensureWoodenAxe(bot) {
  try {
    if (!bot) return false
    
    // Check if already have axe
    const axe = getBestAxe(bot)
    if (axe) {
      console.log('[Wood] Already have axe:', axe.name)
      return true
    }
    
    // Check if have materials for wooden axe (3 planks + 2 sticks)
    const planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
    const sticks = bot.inventory.items().find(i => i && i.name === 'stick')
    
    if (!planks || planks.count < 3 || !sticks || sticks.count < 2) {
      console.log('[Wood] Not enough materials for axe')
      return false
    }
    
    console.log('[Wood] Crafting wooden axe...')
    
    // Ensure crafting table nearby
    const hasTable = await ensureCraftingTable(bot)
    if (!hasTable) {
      console.log('[Wood] Could not get crafting table, trying inventory craft')
    }
    
    // Try to craft axe
    try {
      const axeItemId = bot.registry.itemsByName['wooden_axe']
      if (axeItemId && typeof axeItemId.id === 'number') {
        const recipes = bot.recipesFor(axeItemId.id, null, 1, null)
        if (recipes && recipes.length > 0) {
          await bot.craft(recipes[0], 1)
          console.log('[Wood] Wooden axe crafted!')
          await new Promise(r => setTimeout(r, 300))
          return true
        }
      }
    } catch (e) {
      console.log('[Wood] Craft axe failed:', e.message)
    }
    
    return false
  } catch (e) {
    console.error('[Wood] ensureWoodenAxe error:', e.message)
    return false
  }
}

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
                    await bot.placeBlock(groundBlock, new bot.Vec3(0, 1, 0))
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
    
    const visited = new Set()
    const toVisit = [startBlock.position]
    const blocks = []

    const key = (p) => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`

    while (toVisit.length > 0 && blocks.length < 256) {
      const pos = toVisit.shift()
      if (!pos) continue
      
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
          const goal = new goals.GoalNear(item.position.x, item.position.y, item.position.z, 1)
          await bot.pathfinder.goto(goal)
        }
        await new Promise(r => setTimeout(r, 200)) // Let auto-pickup work
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
    if (!bot || !bot.inventory) {
      console.log('[Wood] craftPlanks: Invalid bot')
      return 0
    }

    const logs = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
    if (!logs) {
      console.log('[Wood] No logs to craft')
      return 0
    }

    let plankType = 'oak_planks'
    try {
      plankType = logs.name.replace('_log', '_planks')
    } catch (e) {
      console.log('[Wood] Error parsing plank type, using default')
    }

    try {
      const plankItemId = bot.registry.itemsByName[plankType]
      if (!plankItemId || typeof plankItemId.id !== 'number') {
        console.log('[Wood] Could not find plank item id')
        return 0
      }
      
      const recipes = bot.recipesFor(plankItemId.id, null, 1, null)
      if (!recipes || recipes.length === 0) {
        console.log('[Wood] No recipes for', plankType)
        return 0
      }

      const toCraft = Math.min(count, logs.count)
      await bot.craft(recipes[0], toCraft)
      bot.chat(`🪵 ${toCraft * 4} planks gecraft`)
      return toCraft * 4
    } catch (e) {
      console.error('[Wood] Craft planks execution error:', e.message)
      return 0
    }
  } catch (e) {
    console.error('[Wood] Craft planks error:', e.message)
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
    if (!bot || !bot.inventory) {
      console.log('[Wood] craftSticks: Invalid bot')
      return 0
    }

    let planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
    if (!planks) {
      console.log('[Wood] No planks, trying to craft from logs')
      await craftPlanks(bot, count)
      planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
      if (!planks) {
        console.log('[Wood] Still no planks after crafting')
        return 0
      }
    }

    try {
      const stickItemId = bot.registry.itemsByName.stick
      if (!stickItemId || typeof stickItemId.id !== 'number') {
        console.log('[Wood] Could not find stick item id')
        return 0
      }

      const recipes = bot.recipesFor(stickItemId.id, null, 1, null)
      if (!recipes || recipes.length === 0) {
        console.log('[Wood] No recipes for sticks')
        return 0
      }

      const toCraft = Math.min(count, Math.floor(planks.count / 2))
      await bot.craft(recipes[0], toCraft)
      bot.chat(`🪵 ${toCraft * 4} sticks gecraft`)
      return toCraft * 4
    } catch (e) {
      console.error('[Wood] Craft sticks execution error:', e.message)
      return 0
    }
  } catch (e) {
    console.error('[Wood] Craft sticks error:', e.message)
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
  console.log('[Wood] harvestWood START - radius:', radius, 'maxBlocks:', maxBlocks)
  
  const opts = {
    replant: options.replant !== false,
    craftPlanks: options.craftPlanks || false,
    craftSticks: options.craftSticks || false
  }

  let collected = 0
  let treesChopped = 0

  try {
    console.log('[Wood] Verifying pathfinder availability...')
    if (!bot.pathfinder || !bot.pathfinder.goto) {
      console.error('[Wood] Pathfinder not initialized. Call setupPathfinder(bot) first!')
      bot.chat('❌ Pathfinder niet beschikbaar')
      return 0
    }
    console.log('[Wood] Pathfinder verified')

    // STEP 0: Ensure we have an axe (craft if needed)
    console.log('[Wood] STEP 0: Checking axe availability...')
    const hasAxe = getBestAxe(bot)
    if (!hasAxe) {
      console.log('[Wood] No axe found, attempting to craft one...')
      bot.chat('🔨 Probeer axe te craften...')
      try {
        const axieCrafted = await ensureWoodenAxe(bot)
        if (axieCrafted) {
          console.log('[Wood] Axe successfully crafted!')
          bot.chat('✅ Axe gecraft')
        } else {
          console.log('[Wood] Could not craft axe, will use bare hands')
          bot.chat('⚠️ Geen axe, hak met blote hand')
        }
      } catch (axeErr) {
        console.error('[Wood] Axe crafting error:', axeErr.message)
      }
      await new Promise(r => setTimeout(r, 500))
    }

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
    while (collected < maxBlocks) {
      console.log(`[Wood] Loop iteration - collected: ${collected}/${maxBlocks}`)
      
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
      // STEP 3: Find nearest log block
      let logBlock
      try {
        logBlock = bot.findBlock({
          matching: b => {
            try {
              return b && b.name && b.name.includes('log')
            } catch (e) {
              return false
            }
          },
          maxDistance: radius,
          count: 1
        })
        console.log('[Wood] Log block found:', logBlock ? logBlock.name : 'null')
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
        console.log('[Wood] Empty cluster, breaking')
        break
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
            try {
              const movements = new Movements(bot)
              movements.canDig = true // Allow breaking obstacles
              bot.pathfinder.setMovements(movements)
              
              const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3)
              await bot.pathfinder.goto(goal)
              console.log('[Wood] Navigation complete')
            } catch (navError) {
              console.log('[Wood] Navigation failed:', navError.message)
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
          // Dig the block
          await bot.dig(block, true)
          console.log('[Wood] Block dug successfully')
          collected++
          
          // Small delay for drops to spawn
          await new Promise(r => setTimeout(r, 300))
          
        } catch (e) {
          console.log('[Wood] Dig failed with error:', e.message)
          if (bot._debug) console.log('[Wood] Dig error stack:', e.stack)
        }
      }

      treesChopped++
      console.log('[Wood] Tree chopped, total trees:', treesChopped)
      try {
        bot.chat(`✅ Boom ${treesChopped} gehakt`)
      } catch (chatErr) {
        console.log('[Wood] Chat error:', chatErr.message)
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

    try {
      bot.chat(`✅ Houthakken klaar: ${collected} logs van ${treesChopped} bomen`)
    } catch (chatErr) {
      console.log('[Wood] Final chat error:', chatErr.message)
    }

    // STEP 6: Plant saplings after all chopping is done
    if (opts.replant) {
      console.log('[Wood] STEP 6: Planting saplings...')
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
        await craftPlanks(bot, Math.floor(collected / 2))
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
  craftPlanks, 
  craftSticks, 
  findConnectedLogs,
  replantSapling,
  collectNearbyItems,
  plantAllSaplings,
  ensureCraftingTable,
  ensureWoodenAxe
}
