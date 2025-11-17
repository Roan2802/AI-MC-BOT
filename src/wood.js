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
        const plantPos = findPlantingSpotNearBase(bot, basePos, plantedPositions)
        if (!plantPos) {
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
          const blockBelow = bot.blockAt(plantPos.offset(0, -1, 0))
          const blockBelow = bot.blockAt(targetPlantPos.offset(0, -1, 0))

          if (blockBelow && (blockBelow.name === 'dirt' || blockBelow.name === 'grass_block' || blockBelow.name === 'podzol')) {
            await bot.placeBlock(blockBelow, { x: 0, y: 1, z: 0 })
            planted++
            plantedPositions.push(plantPos)
            plantedPositions.push(targetPlantPos)
            console.log(
              `[Wood] Planted ${saplingName} at ${Math.floor(plantPos.x)}, ${Math.floor(plantPos.z)}`
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
@@ -98,76 +119,76 @@ async function detectTreeTypeAtBase(bot, basePos) {
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
function findPlantingSpotNearBase(bot, basePos, existingPlants, minSaplingSpacing = 2) {
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
    if (
      block &&
      block.name === 'air' &&
      below &&
      (below.name === 'dirt' || below.name === 'grass_block' || below.name === 'podzol')
    ) {
      // Check not too close to existing plants (minimum 2 blocks apart)
      const tooClose = existingPlants.some(existing => existing.distanceTo(pos) < 2)
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
@@ -488,50 +509,52 @@ async function createPathWithBlocks(bot, targetPos) {
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
 *    - If not → get logs → craft planks/sticks → craft wooden axe
 * 4. Chop the tree completely (tree scanning)
 * 5. Collect logs automatically
 * 6. Stop when inventory is (bijna) vol
 */
async function harvestWood(bot, radius = 20, maxBlocks = 32, options = {}) {
  console.log('[Wood] Starting Simple Wood Axe Workflow v1')
  bot.chat('🌲 Starting wood harvesting...')

  let collected = 0
  let treesChopped = 0
  const treeBases = []
  const inventoryBufferSlots = options.inventoryBufferSlots ?? 2

  const countLogsInInventory = () =>
    bot.inventory
      .items()
      .filter(i => i && i.name && i.name.includes('log'))
      .reduce((sum, item) => sum + (item.count || 0), 0)

  const ensureLogSupply = async (minLogs = 1, preferredLog = null) => {
    let attempts = 0

    while (countLogsInInventory() < minLogs && attempts < 3) {
      attempts++
      const nextLog =
        attempts === 1 && preferredLog
          ? preferredLog
          : bot.findBlock({
              matching: b => b && b.name && b.name.includes('log'),
              maxDistance: radius,
              count: 1
            })

      if (!nextLog) {
        console.log('[Wood] ensureLogSupply: No log found to mine')
        break
@@ -563,251 +586,290 @@ async function harvestWood(bot, radius = 20, maxBlocks = 32, options = {}) {
        }
      }

      const targetBlock = bot.blockAt(nextLog.position)
      if (!targetBlock || !targetBlock.diggable) {
        console.log('[Wood] ensureLogSupply: Target log no longer available')
        continue
      }

      try {
        await bot.dig(targetBlock)
        await new Promise(r => setTimeout(r, 500))
        await collectNearbyItems(bot, 6)
      } catch (digErr) {
        console.log('[Wood] ensureLogSupply: Dig failed:', digErr.message)
      }
    }

    return countLogsInInventory() >= minLogs
  }

  try {
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

    console.log(
      `[Wood] Found tree at distance ${bot.entity.position.distanceTo(logBlock.position)}`
    )
    bot.chat(
      `🌲 Found tree at ${Math.floor(logBlock.position.x)}, ${Math.floor(logBlock.position.z)}`
    )
    while (collected < maxBlocks) {
      if (treesChopped >= (options.maxTrees ?? 6)) {
        console.log('[Wood] Max tree limit reached for this run')
        break
      }

    // STEP 2: Walk there via pathfinder
    console.log('[Wood] STEP 2: Walking to tree...')
    const dist = bot.entity.position.distanceTo(logBlock.position)
      // STEP 1: Find tree block nearby
      console.log('[Wood] STEP 1: Finding tree block nearby...')
      const logBlock = bot.findBlock({
        matching: b => b && b.name && b.name.includes('log'),
        maxDistance: radius,
        count: 1
      })

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
      if (!logBlock) {
        console.log('[Wood] No tree blocks found nearby')
        bot.chat('❌ No trees found nearby')
        break
      }
    }

    // STEP 3: Check if there's an axe - If not, craft one
    console.log('[Wood] STEP 3: Checking for axe...')
    let axe = getBestAxe(bot)
      const treeBase = logBlock.position.floored()
      console.log(
        `[Wood] Found tree at distance ${bot.entity.position.distanceTo(logBlock.position)}`
      )
      bot.chat(
        `🌲 Found tree at ${Math.floor(logBlock.position.x)}, ${Math.floor(logBlock.position.z)}`
      )

    if (!axe) {
      console.log('[Wood] No axe found, crafting wooden axe...')
      bot.chat('🔨 Crafting wooden axe...')
      // STEP 2: Walk there via pathfinder
      console.log('[Wood] STEP 2: Walking to tree...')
      const dist = bot.entity.position.distanceTo(logBlock.position)

      // Zorg dat we minstens 3 logs hebben (genoeg voor tafel + planks + sticks)
      let hasLogs = countLogsInInventory() >= 3
      if (!hasLogs) {
        console.log('[Wood] Not enough logs in inventory, mining extra logs...')
        hasLogs = await ensureLogSupply(3, logBlock)
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

      if (!hasLogs) {
        console.log('[Wood] Still not enough logs for axe + crafting table')
        bot.chat('❌ Not enough logs to craft axe')
        return 0
      }
      // STEP 3: Check if there's an axe - If not, craft one
      console.log('[Wood] STEP 3: Checking for axe...')
      let axe = getBestAxe(bot)

      // Craft planks from logs (3 logs → 12 planks)
      console.log('[Wood] Crafting planks from logs for axe + table...')
      const logsItem = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
      const logsToUse = Math.min(logsItem ? logsItem.count : 3, 3)
      if (logsToUse > 0) {
        await craftPlanksFromLogs(bot, logsToUse)
        await new Promise(r => setTimeout(r, 500))
      }
      if (!axe) {
        console.log('[Wood] No axe found, crafting wooden axe...')
        bot.chat('🔨 Crafting wooden axe...')

      // Ensure crafting table is present and reachable
      const hasTable = await ensureCraftingTable(bot)
      if (!hasTable) {
        console.log('[Wood] Could not craft/place crafting table')
        bot.chat('❌ Geen crafting table beschikbaar')
        return 0
      }
        // Zorg dat we minstens 3 logs hebben (genoeg voor tafel + planks + sticks)
        let hasLogs = countLogsInInventory() >= 3
        if (!hasLogs) {
          console.log('[Wood] Not enough logs in inventory, mining extra logs...')
          hasLogs = await ensureLogSupply(3, logBlock)
        }

      const openedTable = await ensureCraftingTableOpen(bot)
      if (!openedTable) {
        console.log('[Wood] Could not open crafting table for axe recipe')
        bot.chat('❌ Crafting table niet bereikbaar')
        return 0
      }
        if (!hasLogs) {
          console.log('[Wood] Still not enough logs for axe + crafting table')
          bot.chat('❌ Not enough logs to craft axe')
          break
        }

      // Craft sticks if needed
      const planksForSticks = bot.inventory.items().find(
        i => i && i.name && i.name.includes('planks')
      )
      if (planksForSticks && planksForSticks.count >= 2) {
        console.log('[Wood] Crafting sticks for axe...')
        const stickSets = 1 // 1 recipe = 4 sticks, genoeg
        await craftSticks(bot, stickSets)
        await new Promise(r => setTimeout(r, 400))
      }
        // Craft planks from logs (3 logs → 12 planks)
        console.log('[Wood] Crafting planks from logs for axe + table...')
        const logsItem = bot.inventory.items().find(i => i && i.name && i.name.includes('log'))
        const logsToUse = Math.min(logsItem ? logsItem.count : 3, 3)
        if (logsToUse > 0) {
          await craftPlanksFromLogs(bot, logsToUse)
          await new Promise(r => setTimeout(r, 500))
        }

      // Craft axe
      console.log('[Wood] Crafting wooden axe via ensureWoodenAxe...')
      const axeCrafted = await ensureWoodenAxe(bot)
      if (axeCrafted) {
        console.log('[Wood] Axe crafted successfully!')
        bot.chat('✅ Wooden axe crafted!')
        axe = getBestAxe(bot)
      } else {
        console.log('[Wood] Axe crafting failed, continuing with bare hands')
        bot.chat('⚠️ Using bare hands (axe crafting failed)')
      }
    } else {
      console.log(`[Wood] Using existing axe: ${axe.name}`)
    }
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
          break
        }

    // Equip axe if we have one
    if (axe) {
      await bot.equip(axe, 'hand')
      console.log('[Wood] Axe equipped')
    }
        const openedTable = await ensureCraftingTableOpen(bot)
        if (!openedTable) {
          console.log('[Wood] Could not open crafting table for axe recipe')
          bot.chat('❌ Crafting table niet bereikbaar')
          break
        }

    // STEP 4: Chop the tree completely (tree scanning)
    console.log('[Wood] STEP 4: Chopping tree completely...')
    bot.chat('🪓 Chopping tree...')
        // Craft sticks if needed
        const planksForSticks = bot.inventory.items().find(
          i => i && i.name && i.name.includes('planks')
        )
        if (planksForSticks && planksForSticks.count >= 2) {
          console.log('[Wood] Crafting sticks for axe...')
          const stickSets = 1 // 1 recipe = 4 sticks, genoeg
          await craftSticks(bot, stickSets)
          await new Promise(r => setTimeout(r, 400))
        }

    const treeLogs = findConnectedLogs(bot, logBlock, radius)
    console.log(`[Wood] Tree has ${treeLogs.length} logs`)
        // Craft axe
        console.log('[Wood] Crafting wooden axe via ensureWoodenAxe...')
        const axeCrafted = await ensureWoodenAxe(bot)
        if (axeCrafted) {
          console.log('[Wood] Axe crafted successfully!')
          bot.chat('✅ Wooden axe crafted!')
          axe = getBestAxe(bot)
        } else {
          console.log('[Wood] Axe crafting failed, continuing with bare hands')
          bot.chat('⚠️ Using bare hands (axe crafting failed)')
        }

    if (treeLogs.length === 0) {
      console.log('[Wood] No logs found to chop')
      return 0
    }
        const tableAfter = bot.findBlock({
          matching: b => b && b.name === 'crafting_table',
          maxDistance: 6,
          count: 1
        })

    // Sort from top to bottom
    treeLogs.sort((a, b) => b.position.y - a.position.y)
        if (!tableBefore && tableAfter) {
          try {
            await bot.dig(tableAfter)
            await new Promise(r => setTimeout(r, 300))
            await collectNearbyItems(bot, 4)
            console.log('[Wood] Picked up temporary crafting table')
          } catch (digErr) {
            console.log('[Wood] Could not pick up temporary crafting table:', digErr.message)
          }
        }
      } else {
        console.log(`[Wood] Using existing axe: ${axe.name}`)
      }

    for (const log of treeLogs) {
      if (collected >= maxBlocks) {
        console.log('[Wood] Reached max blocks limit')
        break
      // Equip axe if we have one
      if (axe) {
        await bot.equip(axe, 'hand')
        console.log('[Wood] Axe equipped')
      }

      const emptySlots = bot.inventory.emptySlotCount()
      if (emptySlots < inventoryBufferSlots) {
        console.log(
          `[Wood] Inventory low on space (${emptySlots} slots). Stopping log chopping loop.`
        )
        bot.chat('🎒 Inventory full, stopping harvest')
      // STEP 4: Chop the tree completely (tree scanning)
      console.log('[Wood] STEP 4: Chopping tree completely...')
      bot.chat('🪓 Chopping tree...')

      const treeLogs = findConnectedLogs(bot, logBlock, radius)
      console.log(`[Wood] Tree has ${treeLogs.length} logs`)

      if (treeLogs.length === 0) {
        console.log('[Wood] No logs found to chop')
        break
      }

      try {
        console.log(
          `[Wood] Chopping log at ${log.position.x}, ${log.position.y}, ${log.position.z}`
        )
      // Sort from top to bottom
      treeLogs.sort((a, b) => b.position.y - a.position.y)

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
          } catch (navErr) {
            console.log('[Wood] Could not navigate to log:', navErr.message)
            continue
          }
      for (const log of treeLogs) {
        if (collected >= maxBlocks) {
          console.log('[Wood] Reached max blocks limit')
          break
        }

        const currentBlock = bot.blockAt(log.position)
        if (!currentBlock || !currentBlock.name || !currentBlock.name.includes('log')) {
          console.log('[Wood] Log no longer exists')
          continue
        const emptySlots = bot.inventory.emptySlotCount()
        if (emptySlots < inventoryBufferSlots) {
          console.log(
            `[Wood] Inventory low on space (${emptySlots} slots). Stopping log chopping loop.`
          )
          bot.chat('🎒 Inventory full, stopping harvest')
          break
        }

        await bot.dig(currentBlock)
        collected++
        console.log(`[Wood] Chopped log ${collected}/${maxBlocks}`)
        await new Promise(r => setTimeout(r, 300))
      } catch (digErr) {
        console.log('[Wood] Error chopping log:', digErr.message)
        collected++
        try {
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

          await bot.dig(currentBlock)
          collected++
          console.log(`[Wood] Chopped log ${collected}/${maxBlocks}`)
          await new Promise(r => setTimeout(r, 300))
        } catch (digErr) {
          console.log('[Wood] Error chopping log:', digErr.message)
          collected++
        }
      }
    }

    // STEP 5: Collect logs automatically
    console.log('[Wood] STEP 5: Collecting logs...')
    bot.chat('📦 Collecting logs...')
    await new Promise(r => setTimeout(r, 1000))
    await collectNearbyItems(bot, 15)
      // STEP 5: Collect logs automatically
      console.log('[Wood] STEP 5: Collecting logs...')
      bot.chat('📦 Collecting logs...')
      await new Promise(r => setTimeout(r, 1000))
      await collectNearbyItems(bot, 15)

      treesChopped++
      treeBases.push(treeBase)

    const inventorySpace = bot.inventory.emptySlotCount()
    console.log(`[Wood] Inventory has ${inventorySpace} empty slots`)
      const inventorySpace = bot.inventory.emptySlotCount()
      console.log(`[Wood] Inventory has ${inventorySpace} empty slots`)

      if (inventorySpace < 5) {
        console.log('[Wood] Inventory nearly full, stopping')
        bot.chat('🎒 Inventory full, stopping harvest')
        break
      }
    }

    if (inventorySpace < 5) {
      console.log('[Wood] Inventory nearly full, stopping')
      bot.chat('🎒 Inventory full, stopping harvest')
    if (treeBases.length > 0) {
      await plantSaplingsAtTreeBases(bot, treeBases, { minSaplingSpacing: 3 })
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
