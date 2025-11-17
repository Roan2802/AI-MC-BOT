/**
 * Wood Farming Module
 * 
 * Functions for sapling planting and item collection:
 * - Plant all saplings
 * - Replant saplings at tree locations
 * - Collect nearby items
 */

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

module.exports = {
  plantAllSaplings,
  collectNearbyItems,
  replantSapling
}
