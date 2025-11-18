/**
 * Block Crafting Module
 * Handles crafting tables and furnaces placement/creation
 */

const pathfinderPkg = require('mineflayer-pathfinder')
const { goals } = pathfinderPkg

/**
 * Unstuck helper: breaks blocks around bot if stuck
 */
async function unstuckBot(bot) {
  console.log('[Crafting] Bot stuck, breaking surrounding blocks...')
  const botPos = bot.entity.position
  
  // Break blocks in 1-block radius (except floor and ceiling)
  const offsets = [
    { x: 1, y: 0, z: 0 },   // Right
    { x: -1, y: 0, z: 0 },  // Left
    { x: 0, y: 0, z: 1 },   // Front
    { x: 0, y: 0, z: -1 },  // Back
    { x: 1, y: 0, z: 1 },   // Diagonal
    { x: -1, y: 0, z: 1 },
    { x: 1, y: 0, z: -1 },
    { x: -1, y: 0, z: -1 },
  ]
  
  for (const offset of offsets) {
    const blockPos = botPos.offset(offset.x, offset.y, offset.z).floored()
    const block = bot.blockAt(blockPos)
    if (block && block.diggable && !block.name.includes('air')) {
      try {
        bot._isDigging = true
        await bot.dig(block)
        bot._isDigging = false
        console.log(`[Crafting] Broke ${block.name} to unstuck`)
        await new Promise(r => setTimeout(r, 100))
      } catch(e) {
        bot._isDigging = false
      }
    }
  }
  console.log('[Crafting] Unstuck complete')
}

/**
 * Place crafting table at nearby position
 */
async function placeCraftingTable(bot) {
  console.log('[Crafting] Placing crafting table...')
  
  // Add overall timeout to prevent hanging (extended to 45 seconds for mining + placement)
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Placement timeout after 45 seconds')), 45000)
  })
  
  const placementPromise = (async () => {
    try {
      const craftingTable = bot.inventory.items().find(i => i.name === 'crafting_table')
      
      if (!craftingTable) {
        console.log('[Crafting] No crafting table in inventory')
        return false
      }
    
    // First, ensure bot is on solid ground (move down if in tree/air)
    const { Movements, goals } = require('mineflayer-pathfinder')
    let groundY = Math.floor(bot.entity.position.y)
    for (let dy = 0; dy >= -10; dy--) {
      const checkBlock = bot.blockAt(bot.entity.position.offset(0, dy - 1, 0))
      if (checkBlock && !checkBlock.name.includes('air') && !checkBlock.name.includes('leaves') && checkBlock.name !== 'water' && checkBlock.name !== 'lava') {
        groundY = Math.floor(bot.entity.position.y) + dy
        break
      }
    }
    // Move to ground level if we're floating
    if (Math.abs(bot.entity.position.y - groundY) > 0.5) {
      try {
        const movements = new Movements(bot)
        bot.pathfinder.setMovements(movements)
        const goal = new goals.GoalBlock(Math.floor(bot.entity.position.x), groundY, Math.floor(bot.entity.position.z))
        await bot.pathfinder.goto(goal)
        await new Promise(r => setTimeout(r, 300))
      } catch(e) { console.log('[Crafting] Could not descend to ground:', e.message) }
    }
    
    // Ensure equipped once before attempts
    await bot.equip(craftingTable, 'hand')
    await new Promise(r => setTimeout(r, 200))
    
    const botPos = bot.entity.position
    
    // Priority 1: Try to place directly on the floor next to bot (tunnel-friendly)
    // Also try placing ON THE FLOOR where bot is standing (for tight tunnels)
    const simplePositions = [
      { x: 0, y: -1, z: 0 },  // Right below bot (floor placement)
      { x: 0, y: 0, z: 1 },   // Front
      { x: 0, y: 0, z: -1 },  // Back
      { x: 1, y: 0, z: 0 },   // Right
      { x: -1, y: 0, z: 0 },  // Left
      { x: 1, y: 0, z: 1 },   // Diagonal front-right
      { x: -1, y: 0, z: 1 },  // Diagonal front-left
      { x: 1, y: 0, z: -1 },  // Diagonal back-right
      { x: -1, y: 0, z: -1 }, // Diagonal back-left
    ]
    
    for (const offset of simplePositions) {
      const targetPos = botPos.offset(offset.x, offset.y, offset.z).floored()
      const groundBlock = bot.blockAt(targetPos.offset(0, -1, 0))
      const airBlock = bot.blockAt(targetPos)
      
      // Special case: floor placement (y=-1) - check if current position has solid ground
      if (offset.y === -1) {
        const floorBlock = bot.blockAt(targetPos)
        if (floorBlock && !floorBlock.name.includes('air') && floorBlock.name !== 'water' && floorBlock.name !== 'lava') {
          try {
            const stillHas = bot.inventory.items().find(i => i.name === 'crafting_table')
            if (!stillHas) {
              console.log('[Crafting] Crafting table lost from inventory')
              return false
            }
            if (!bot.heldItem || bot.heldItem.name !== 'crafting_table') {
              await bot.equip(stillHas, 'hand')
              await new Promise(r => setTimeout(r, 200))
            }
            
            // Place on top of floor block (ignore timeout errors, check result instead)
            try {
              await bot.placeBlock(floorBlock, { x: 0, y: 1, z: 0 })
            } catch(e) {
              // Ignore "blockUpdate timeout" - check if it actually placed
              if (!e.message.includes('blockUpdate') && !e.message.includes('timeout')) {
                throw e // Re-throw if it's a real error
              }
            }
            
            console.log('[Crafting] ✅ Crafting table placed on floor')
            await new Promise(r => setTimeout(r, 500))
            
            // Check if table actually exists now
            const verify = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 5, count: 1 })
            if (verify) {
              console.log('[Crafting] Table verified within reach')
              return true
            }
            console.log('[Crafting] Floor placement failed verification - trying next position')
            continue
          } catch (e) {
            console.log('[Crafting] Floor placement error:', e.message)
            continue
          }
        }
        continue // Skip normal check for y=-1
      }
      
      // Ground must be solid, target must be air
      if (groundBlock && !groundBlock.name.includes('air') && groundBlock.name !== 'water' && groundBlock.name !== 'lava' &&
          airBlock && airBlock.name === 'air') {
        try {
          // Re-equip before attempt
          const stillHas = bot.inventory.items().find(i => i.name === 'crafting_table')
          if (!stillHas) {
            console.log('[Crafting] Crafting table lost from inventory')
            return false
          }
          if (!bot.heldItem || bot.heldItem.name !== 'crafting_table') {
            await bot.equip(stillHas, 'hand')
            await new Promise(r => setTimeout(r, 100))
          }
          
          await bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 })
          console.log('[Crafting] ✅ Crafting table placed successfully')
          await new Promise(r => setTimeout(r, 300))
          // Verify placement - can we find it?
          const verify = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 5, count: 1 })
          if (verify) {
            console.log('[Crafting] Table verified within reach')
            return true
          }
          console.log('[Crafting] Table placed but not reachable - trying next position')
          continue
        } catch (e) {
          // Try next position
          continue
        }
      }
    }
    
    // Priority 2: Extended search in 3x3x3 area (original logic)
    for (let dy = 0; dy >= -2; dy--) {
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue
          
          const checkPos = botPos.offset(dx, dy, dz)
          const groundBlock = bot.blockAt(checkPos.offset(0, -1, 0))
          const topBlock = bot.blockAt(checkPos)
          
          if (groundBlock && !groundBlock.name.includes('air') && topBlock && topBlock.name === 'air') {
            try {
              const stillHas = bot.inventory.items().find(i => i.name === 'crafting_table')
              if (!stillHas) {
                console.log('[Crafting] Crafting table lost from inventory during placement')
                return false
              }
              if (!bot.heldItem || bot.heldItem.name !== 'crafting_table') {
                await bot.equip(stillHas, 'hand')
                await new Promise(r => setTimeout(r, 100))
              }
              
              await bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 })
              console.log('[Crafting] ✅ Crafting table placed successfully')
              await new Promise(r => setTimeout(r, 300))
              return true
            } catch (e) {
              continue
            }
          }
        }
      }
    }
    
    console.log('[Crafting] No suitable ground to place crafting table nearby')
    
    // Last resort: Mine 1 staircase step forward (dig 2 blocks ahead + 1 below) to create space
    console.log('[Crafting] Mining 1 staircase step to create space for table... (with retries)')
    try {
      // Use stored staircase direction if available, otherwise use bot's yaw
      let dx = 0, dz = 0
      if (bot._staircaseDirection) {
        dx = bot._staircaseDirection.x
        dz = bot._staircaseDirection.z
        console.log(`[Crafting] Using staircase direction: dx=${dx}, dz=${dz}`)
      } else {
        // Fallback: determine from bot's yaw
        const yaw = bot.entity.yaw
        if (yaw >= -Math.PI / 4 && yaw < Math.PI / 4) {
          dz = 1 // South
        } else if (yaw >= Math.PI / 4 && yaw < 3 * Math.PI / 4) {
          dx = -1 // West
        } else if (yaw >= -3 * Math.PI / 4 && yaw < -Math.PI / 4) {
          dx = 1 // East
        } else {
          dz = -1 // North
        }
      }
      
      const botPos = bot.entity.position.floored()
      
      // Equip pickaxe for mining (if available)
      const pickaxe = bot.inventory.items().find(i => i.name && i.name.includes('pickaxe'))
      if (pickaxe) {
        try {
          await bot.equip(pickaxe, 'hand')
          await new Promise(r => setTimeout(r, 100))
          console.log(`[Crafting] Equipped ${pickaxe.name} for mining`)
        } catch(e) {
          console.log('[Crafting] Could not equip pickaxe:', e.message)
        }
      }
      
      // Helper dig function with retry on aborted digs
      async function digWithRetry(targetBlock, label) {
        if (!targetBlock || !targetBlock.diggable || targetBlock.name.includes('air')) return
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            // Cancel any pathfinder goal that might abort digging
            bot.pathfinder.setGoal(null)
            await new Promise(r => setTimeout(r, 60))
            bot._isDigging = true
            await bot.dig(targetBlock)
            bot._isDigging = false
            if (attempt > 1) console.log(`[Crafting] Dig ${label} succeeded on retry ${attempt}`)
            await new Promise(r => setTimeout(r, 120))
            return
          } catch(e) {
            bot._isDigging = false
            if (e.message && e.message.includes('Digging aborted')) {
              console.log(`[Crafting] Dig aborted (${label}) attempt ${attempt}, retrying...`)
              await new Promise(r => setTimeout(r, 200))
              continue
            } else {
              console.log(`[Crafting] Dig error (${label}):`, e.message)
              return
            }
          }
        }
        console.log(`[Crafting] Failed to dig ${label} after retries`)
      }

      // Dig 2 blocks ahead (same level + 1 up) with retry logic
      for (let dy = 0; dy <= 1; dy++) {
        const blockPos = botPos.offset(dx, dy, dz)
        const block = bot.blockAt(blockPos)
        await digWithRetry(block, `ahead(y+${dy})`)
      }

      // Dig 1 block below ahead (staircase down) with retry logic
      const belowAhead = botPos.offset(dx, -1, dz)
      const belowBlock = bot.blockAt(belowAhead)
      await digWithRetry(belowBlock, 'belowAhead')

      // Small pause to let items settle / physics update
      await new Promise(r => setTimeout(r, 350))
      
      console.log('[Crafting] Staircase step mined, trying placement again...')
      
      // Now try placing on the floor we just created
      const newFloorPos = botPos.offset(dx, -1, dz)
      const newFloor = bot.blockAt(newFloorPos.offset(0, -1, 0))
      if (newFloor && !newFloor.name.includes('air') && newFloor.name !== 'water' && newFloor.name !== 'lava') {
        const stillHas = bot.inventory.items().find(i => i.name === 'crafting_table')
        if (stillHas) {
          await bot.equip(stillHas, 'hand')
          await new Promise(r => setTimeout(r, 200))
          
          try {
            await bot.placeBlock(newFloor, { x: 0, y: 1, z: 0 })
          } catch(e) {
            if (!e.message.includes('blockUpdate') && !e.message.includes('timeout')) {
              throw e
            }
          }
          
          console.log('[Crafting] ✅ Crafting table placed in new staircase step')
          await new Promise(r => setTimeout(r, 500))
          
          const verify = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 5, count: 1 })
          if (verify) {
            console.log('[Crafting] Table verified within reach')
            return true
          }
        }
      }
    } catch(e) {
      bot._isDigging = false
      console.log('[Crafting] Staircase mining failed:', e.message)
      // Extra grace period before failing placement to avoid premature timeout
      await new Promise(r => setTimeout(r, 400))
    }
    
    return false
  } catch (e) {
    console.error('[Crafting] Place crafting table failed:', e.message)
    return false
  }
  })()
  
  // Race between placement and timeout
  try {
    return await Promise.race([placementPromise, timeoutPromise])
  } catch(e) {
    console.error('[Crafting] Placement timeout or error:', e.message)
    bot.pathfinder.setGoal(null) // Cancel any pending pathfinding
    return false
  }
}

/**
 * Place furnace at nearby position
 */
async function placeFurnace(bot) {
  try {
    const furnace = bot.inventory.items().find(i => i.name === 'furnace')
    
    if (!furnace) {
      console.log('[Crafting] No furnace in inventory')
      return false
    }
    
    // Find ground block to place on
    const groundBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0))
    if (!groundBlock || groundBlock.name === 'air') {
      console.log('[Crafting] No suitable ground to place furnace')
      return false
    }
    
    await bot.equip(furnace, 'hand')
    await bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 })
    console.log('[Crafting] Furnace placed')
    await new Promise(r => setTimeout(r, 300))
    return true
  } catch (e) {
    console.error('[Crafting] Place furnace failed:', e.message)
    return false
  }
}

/**
 * Ensure crafting table is available nearby or create one
 */
async function ensureCraftingTable(bot) {
  try {
    // Check if crafting table already nearby
    const craftingTable = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 5,
      count: 1
    })
    
    if (craftingTable) {
      console.log('[Crafting] Crafting table found nearby')
      return true
    }
    
    // Helper to gather logs if missing (move onto drops & wait for pickup)
    async function gatherLogsForTable(maxAttempts = 24) {
      const pathfinderPkg = require('mineflayer-pathfinder')
      const { Movements, goals } = pathfinderPkg
      let attempts = 0
      let lastTreePos = null
      
      try {
        while (attempts < maxAttempts) {
          attempts++
          const logsCount = bot.inventory.items().filter(i => i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
          const planksCount = bot.inventory.items().filter(i => i.name && i.name.includes('planks')).reduce((s,it)=>s+it.count,0)
          
          // If we have 5+ logs, finish the current tree first before stopping
          if (logsCount >= 5 || planksCount >= 4) {
            // Check for adjacent logs (same tree) - ONLY if we just mined a log
            if (lastTreePos) {
              const nearbyLog = bot.findBlock({ 
                matching: b => b && b.name && b.name.includes('log'), 
                maxDistance: 2,
                point: lastTreePos,
                count: 1 
              })
              if (nearbyLog) {
                console.log(`[Crafting] Finishing tree (${logsCount} logs collected so far)`)
                // Continue this tree, don't break
              } else {
                // Tree finished, we're done
                bot.chat(`✅ ${logsCount} logs verzameld`)
                break
              }
            } else {
              bot.chat(`✅ ${logsCount} logs verzameld`)
              break
            }
          }
          
          if (attempts === 1) bot.chat('🌲 Hout verzamelen (doel: 4 logs)')
          const logBlock = bot.findBlock({ matching: b => b && b.name && b.name.includes('log'), maxDistance: 48, count:1 })
          if (!logBlock) {
            if (attempts === 1) console.log('[Crafting] Geen boom gevonden binnen 48 bloks')
            break
          }
          
          lastTreePos = logBlock.position.clone()
          
          try {
            const dist = bot.entity.position.distanceTo(logBlock.position)
            if (dist > 3) {
              const movements = new Movements(bot)
              movements.canDig = true
              bot.pathfinder.setMovements(movements)
              const goal = new goals.GoalNear(logBlock.position.x, logBlock.position.y, logBlock.position.z, 2)
              
              // Track position to detect if stuck
              const startPos = bot.entity.position.clone()
              let stuckCheckInterval = null
              let isStuck = false
              
              // Check every 2 seconds if bot is stuck (not moving)
              stuckCheckInterval = setInterval(() => {
                const currentPos = bot.entity.position
                const movedDistance = startPos.distanceTo(currentPos)
                if (movedDistance < 0.5) { // Hasn't moved 0.5 blocks
                  isStuck = true
                  bot.pathfinder.setGoal(null)
                  console.log('[Crafting] Bot stuck during pathfinding, will unstuck')
                }
                startPos.x = currentPos.x
                startPos.y = currentPos.y
                startPos.z = currentPos.z
              }, 2000)
              
              // Set timeout for pathfinding (prevent getting stuck) - 10 seconds for far trees
              const pathTimeout = setTimeout(() => {
                clearInterval(stuckCheckInterval)
                bot.pathfinder.setGoal(null)
                console.log('[Crafting] Pathfinding timeout, skipping this log')
              }, 10000)
              
              try {
                await bot.pathfinder.goto(goal)
                clearTimeout(pathTimeout)
                clearInterval(stuckCheckInterval)
              } catch(e) {
                clearTimeout(pathTimeout)
                clearInterval(stuckCheckInterval)
                
                // If stuck, break surrounding blocks
                if (isStuck) {
                  await unstuckBot(bot)
                }
                
                console.log('[Crafting] Pathfinding failed:', e.message)
                continue // Skip this log and try next one
              }
            }
            const blk = bot.blockAt(logBlock.position)
            if (!blk || !blk.diggable) {
              console.log('[Crafting] Log block not diggable, skipping')
              continue
            }
            
            // Stop pathfinder before digging to prevent abort
            bot.pathfinder.setGoal(null)
            await new Promise(r => setTimeout(r, 100))
            
            // Try digging with retry (max 3 attempts)
            let digSuccess = false
            for (let digAttempt = 0; digAttempt < 3; digAttempt++) {
              try {
                bot._isDigging = true
                await bot.dig(blk)
                bot._isDigging = false
                digSuccess = true
                break
              } catch(e) {
                bot._isDigging = false
                if (e.message.includes('aborted')) {
                  console.log(`[Crafting] Dig aborted, retry ${digAttempt + 1}/3`)
                  await new Promise(r => setTimeout(r, 200))
                  continue
                } else {
                  console.log('[Crafting] Dig failed:', e.message)
                  break
                }
              }
            }
            
            if (!digSuccess) {
              console.log('[Crafting] Could not dig log after retries, skipping')
              continue
            }
            
            const dropPos = blk.position.floored()
            try {
              const movements2 = new Movements(bot)
              bot.pathfinder.setMovements(movements2)
              const goal2 = new goals.GoalNear(dropPos.x, dropPos.y, dropPos.z, 1)
              await bot.pathfinder.goto(goal2)
            } catch(e) { console.log('[Crafting] Pickup move error:', e.message) }
            
            // LONGER wait loop for pickup - break immediately once count increases
            const start = Date.now()
            let increased = false
            console.log(`[Crafting] Waiting for log pickup (currently ${logsCount} logs)...`)
            while (Date.now() - start < 2000) { // Increased to 2 seconds
              const newLogs = bot.inventory.items().filter(i => i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
              if (newLogs > logsCount) { 
                increased = true
                console.log(`[Crafting] ✅ Picked up log! Now have ${newLogs} logs`)
                break 
              }
              
              // Actively search for item entities and move towards them
              const itemEntities = Object.values(bot.entities).filter(e => 
                e && e.name === 'item' && 
                e.position.distanceTo(bot.entity.position) < 8 &&
                e.metadata && e.metadata[8] // Item entity metadata
              )
              
              if (itemEntities.length > 0) {
                const closest = itemEntities.reduce((a,b) => 
                  a.position.distanceTo(bot.entity.position) < b.position.distanceTo(bot.entity.position) ? a : b
                )
                
                if (closest.position.distanceTo(bot.entity.position) > 1.5) {
                  try {
                    const movements3 = new Movements(bot)
                    bot.pathfinder.setMovements(movements3)
                    const goal3 = new goals.GoalNear(closest.position.x, closest.position.y, closest.position.z, 1)
                    await bot.pathfinder.goto(goal3)
                  } catch(e) { console.log('[Crafting] Item entity approach error:', e.message) }
                }
              }
              await new Promise(r=>setTimeout(r,100))
            }
            
            // Extra wait to ensure all items are collected
            await new Promise(r=>setTimeout(r,300))
            
            // Check final count AFTER all waits
            const afterLogs = bot.inventory.items().filter(i => i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
            if (!increased && afterLogs === logsCount) {
              console.log(`[Crafting] ⚠️ No log picked up after 2s wait (still ${afterLogs} logs)`)
            }
            if (afterLogs < 5) {
              bot.chat(`🪵 Logs: ${afterLogs}/5`)
            }
          } catch(e){ 
            bot._isDigging = false
            console.log('[Crafting] Log gather iteration error:', e.message)
          }
        }
      } catch(e) {
        bot._isDigging = false
        console.error('[Crafting] gatherLogsForTable error:', e.message)
        bot.chat('❌ Error tijdens hout verzamelen')
      }
      const finalLogs = bot.inventory.items().filter(i => i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
      const finalPlanks = bot.inventory.items().filter(i => i.name && i.name.includes('planks')).reduce((s,it)=>s+it.count,0)
      
      // Debug: show all wood types
      const woodTypes = bot.inventory.items().filter(i => i.name && (i.name.includes('log') || i.name.includes('planks')))
      console.log('[Crafting] Wood inventory:', woodTypes.map(i => `${i.name}:${i.count}`).join(', '))
      
      if (finalLogs < 5 && finalPlanks < 4) {
        bot.chat(`❌ Niet genoeg hout (${finalLogs} logs, ${finalPlanks} planks)`)
      } else if (finalLogs >= 5) {
        bot.chat(`✅ ${finalLogs} logs verzameld`)
      }
    }

    // Try to get/make planks for crafting table (need 4 planks OR 5+ logs)
    const totalPlanks = bot.inventory.items().filter(i => i && i.name && i.name.includes('planks')).reduce((s,it)=>s+it.count,0)
    const totalLogs = bot.inventory.items().filter(i => i && i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
    
    // Skip log gathering if we're in the middle of auto mining (already have pickaxe)
    const hasPickaxe = bot.inventory.items().some(i => i.name && i.name.includes('pickaxe'))
    if (hasPickaxe && bot.isDoingTask) {
      console.log('[Crafting] Already have pickaxe during task, skipping log gathering')
      // Just use whatever we have, even if less than ideal
      if (totalPlanks < 4 && totalLogs < 1) {
        console.log('[Crafting] No wood available for crafting table')
        return false
      }
    } else if (totalPlanks < 4 && totalLogs < 5) {
      console.log('[Crafting] Hout verzamelen voor crafting table... (5+ logs vereist)')
      await gatherLogsForTable()
    }
    
    // Refresh totals
    const newTotalPlanks = bot.inventory.items().filter(i => i && i.name && i.name.includes('planks')).reduce((s,it)=>s+it.count,0)
    const newTotalLogs = bot.inventory.items().filter(i => i && i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
    
    if (newTotalPlanks < 4 && newTotalLogs >= 1) {
      console.log('[Crafting] Crafting planks from logs for crafting table...')
      // Get ANY log item (oak, birch, etc.)
      const anyLog = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
      if (anyLog) {
        try {
          const plankType = anyLog.name.replace('_log', '_planks')
          const plankItemId = bot.registry.itemsByName[plankType]
          if (plankItemId && typeof plankItemId.id === 'number') {
            const recipes = bot.recipesFor(plankItemId.id, null, 1, null)
            if (recipes && recipes.length > 0) {
              await bot.craft(recipes[0], 1)
              console.log('[Crafting] Crafted planks')
              await new Promise(r => setTimeout(r, 200))
            }
          }
        } catch(e){ console.log('[Crafting] Failed to craft planks:', e.message) }
      }
    }
    
    // Final check
    const finalPlanks = bot.inventory.items().filter(i => i && i.name && i.name.includes('planks')).reduce((s,it)=>s+it.count,0)
    const finalLogs = bot.inventory.items().filter(i => i && i.name && i.name.includes('log')).reduce((s,it)=>s+it.count,0)
    
    if (finalPlanks < 4 && finalLogs < 5) {
      console.log(`[Crafting] Not enough logs/planks after gather attempt (logs=${finalLogs}, planks=${finalPlanks})`)
      return false
    }
    
    console.log('[Crafting] Crafting table not found, crafting one...')
    
    // Craft crafting table
    try {
      const tableItemId = bot.registry.itemsByName['crafting_table']
      if (!tableItemId || typeof tableItemId.id !== 'number') {
        console.log('[Crafting] Crafting table not in registry')
        return false
      }
      
      const recipes = bot.recipesFor(tableItemId.id, null, 1, null)
      if (!recipes || recipes.length === 0) {
        console.log('[Crafting] No recipe for crafting table')
        return false
      }
      
      await bot.craft(recipes[0], 1)
      console.log('[Crafting] Crafting table crafted')
      await new Promise(r => setTimeout(r, 300))
      
      // Place it
      return await placeCraftingTable(bot)
    } catch (e) {
      console.log('[Crafting] Failed to craft table:', e.message)
      return false
    }
  } catch (e) {
    console.error('[Crafting] ensureCraftingTable error:', e.message)
    return false
  }
}

/**
 * Ensure furnace is available nearby or create one
 */
async function ensureFurnace(bot) {
  try {
    // Check if furnace already nearby
    const furnace = bot.findBlock({
      matching: b => b && b.name === 'furnace',
      maxDistance: 5,
      count: 1
    })
    
    if (furnace) {
      console.log('[Crafting] Furnace found nearby')
      return true
    }
    
    // Try to smelt cobblestone for furnace
    const cobblestone = bot.inventory.items().find(i => i && i.name === 'cobblestone')
    if (!cobblestone || cobblestone.count < 8) {
      console.log('[Crafting] Not enough cobblestone for furnace')
      return false
    }
    
    console.log('[Crafting] Furnace not found, crafting one...')
    
    try {
      const furnaceItemId = bot.registry.itemsByName['furnace']
      if (furnaceItemId && typeof furnaceItemId.id === 'number') {
        const recipes = bot.recipesFor(furnaceItemId.id, null, 1, null)
        if (recipes && recipes.length > 0) {
          await bot.craft(recipes[0], 1)
          console.log('[Crafting] Furnace crafted')
          await new Promise(r => setTimeout(r, 300))
          
          // Place it
          return await placeFurnace(bot)
        }
      }
    } catch (e) {
      console.log('[Crafting] Failed to craft furnace:', e.message)
    }
    
    return false
  } catch (e) {
    console.error('[Crafting] ensureFurnace error:', e.message)
    return false
  }
}

module.exports = {
  placeCraftingTable,
  placeFurnace,
  ensureCraftingTable,
  ensureFurnace
}
