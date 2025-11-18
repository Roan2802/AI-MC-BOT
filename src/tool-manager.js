/**
 * Tool Manager Module
 * 
 * Automatically replaces broken tools:
 * - Axe (wooden → stone → iron → diamond)
 * - Pickaxe (wooden → stone → iron → diamond)
 * - Sword (wooden → stone → iron → diamond)
 * - Hoe (wooden → stone → iron → diamond)
 * - Shovel (wooden → stone → iron → diamond)
 * 
 * When a tool breaks:
 * 1. Place crafting table if needed
 * 2. Craft replacement tool (same or better tier)
 * 3. Pick up crafting table
 */

const { ensureCraftingTable } = require('./crafting-blocks.js')
const { Vec3 } = require('vec3')

// Tool durability thresholds (percentage)
const DURABILITY_WARNING = 20 // Warn when tool is below 20%
const DURABILITY_CRITICAL = 5 // Replace when tool is below 5%

/**
 * Tool tiers in order of quality
 */
const TOOL_TIERS = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite']

/**
 * Get tool tier index
 */
function getToolTier(toolName) {
  for (let i = 0; i < TOOL_TIERS.length; i++) {
    if (toolName.includes(TOOL_TIERS[i])) {
      return i
    }
  }
  return -1
}

/**
 * Get tool type (axe, pickaxe, sword, hoe, shovel)
 */
function getToolType(toolName) {
  if (toolName.includes('axe') && !toolName.includes('pickaxe')) return 'axe'
  if (toolName.includes('pickaxe')) return 'pickaxe'
  if (toolName.includes('sword')) return 'sword'
  if (toolName.includes('hoe')) return 'hoe'
  if (toolName.includes('shovel')) return 'shovel'
  return null
}

/**
 * Get material requirements for a tool
 */
function getToolMaterials(tier, type) {
  const materials = {
    wooden: { material: 'planks', count: type === 'sword' ? 2 : 3, stick: 2 },
    stone: { material: 'cobblestone', count: type === 'sword' ? 2 : 3, stick: 2 },
    iron: { material: 'iron_ingot', count: type === 'sword' ? 2 : 3, stick: 2 },
    golden: { material: 'gold_ingot', count: type === 'sword' ? 2 : 3, stick: 2 },
    diamond: { material: 'diamond', count: type === 'sword' ? 2 : 3, stick: 2 },
    netherite: { material: 'netherite_ingot', count: type === 'sword' ? 2 : 3, stick: 2 }
  }
  
  return materials[tier]
}

/**
 * Check if bot has materials for a specific tool
 */
function hasMaterialsForTool(bot, tier, type) {
  const materials = getToolMaterials(tier, type)
  if (!materials) return false
  
  const sticks = bot.inventory.items().find(i => i.name === 'stick')
  if (!sticks || sticks.count < materials.stick) return false
  
  // For wooden tools, check for any planks
  if (tier === 'wooden') {
    const planks = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
    return planks && planks.count >= materials.count
  }
  
  const material = bot.inventory.items().find(i => i.name === materials.material)
  return material && material.count >= materials.count
}

/**
 * Get best available tier for crafting based on inventory
 */
function getBestAvailableTier(bot, type, minTier = 'wooden') {
  const minTierIndex = TOOL_TIERS.indexOf(minTier)
  
  // Check from highest to lowest tier
  for (let i = TOOL_TIERS.length - 1; i >= minTierIndex; i--) {
    const tier = TOOL_TIERS[i]
    if (hasMaterialsForTool(bot, tier, type)) {
      return tier
    }
  }
  
  return null
}

/**
 * Craft a specific tool
 */
async function craftTool(bot, tier, type) {
  try {
    console.log(`[ToolManager] Crafting ${tier} ${type}...`)
    
    // Check materials
    if (!hasMaterialsForTool(bot, tier, type)) {
      console.log(`[ToolManager] Insufficient materials for ${tier} ${type}`)
      return false
    }
    
    // Find or place crafting table
    let craftingTable = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 5,
      count: 1
    })
    
    const tablePlaced = !craftingTable
    
    if (!craftingTable) {
      console.log('[ToolManager] No crafting table found, placing one...')
      const hasTable = await ensureCraftingTable(bot)
      if (!hasTable) {
        console.log('[ToolManager] Could not place crafting table')
        return false
      }
      
      craftingTable = bot.findBlock({
        matching: b => b && b.name === 'crafting_table',
        maxDistance: 5,
        count: 1
      })
      
      if (!craftingTable) {
        console.log('[ToolManager] Crafting table not found after placement')
        return false
      }
    }
    
    // Open crafting table
    await bot.openBlock(craftingTable)
    await new Promise(r => setTimeout(r, 500))
    
    // Get recipe
    const toolName = `${tier}_${type}`
    const toolItem = bot.registry.itemsByName[toolName]
    
    if (!toolItem) {
      console.log(`[ToolManager] Tool ${toolName} not found in registry`)
      if (tablePlaced) await pickUpCraftingTable(bot, craftingTable)
      return false
    }
    
    const recipes = bot.recipesFor(toolItem.id, null, 1, craftingTable)
    if (!recipes || recipes.length === 0) {
      console.log(`[ToolManager] No recipes found for ${toolName}`)
      if (tablePlaced) await pickUpCraftingTable(bot, craftingTable)
      return false
    }
    
    // Craft the tool
    await bot.craft(recipes[0], 1, craftingTable)
    console.log(`[ToolManager] ✅ Crafted ${tier} ${type}`)
    await new Promise(r => setTimeout(r, 500))
    
    // Close window
    if (bot.currentWindow) {
      bot.closeWindow(bot.currentWindow)
      await new Promise(r => setTimeout(r, 300))
    }
    
    // Pick up crafting table if we placed it
    if (tablePlaced) {
      await pickUpCraftingTable(bot, craftingTable)
    }
    
    return true
  } catch (e) {
    console.error(`[ToolManager] Error crafting ${tier} ${type}:`, e.message)
    return false
  }
}

/**
 * Pick up a crafting table
 */
async function pickUpCraftingTable(bot, craftingTable) {
  try {
    console.log('[ToolManager] Picking up crafting table...')
    
    // Refresh the block reference
    const table = bot.blockAt(craftingTable.position)
    if (!table || table.name !== 'crafting_table') {
      console.log('[ToolManager] Crafting table no longer exists')
      return
    }
    
    await bot.dig(table)
    await new Promise(r => setTimeout(r, 800))
    
    // Collect the dropped table
    const pathfinderPkg = require('mineflayer-pathfinder')
    const { goals } = pathfinderPkg
    
    const nearbyItems = Object.values(bot.entities).filter(e => {
      try {
        if (!e || !e.position) return false
        if (e.position.distanceTo(bot.entity.position) >= 8) return false
        
        let isItem = false
        try {
          isItem = e.displayName === 'Item'
        } catch (e1) {
          try {
            isItem = e.objectType === 'item' || e.objectType === 'Item'
          } catch (e2) {
            isItem = (e.name || '').includes('item')
          }
        }
        return isItem
      } catch (err) {
        return false
      }
    })
    
    for (const item of nearbyItems) {
      try {
        const dist = bot.entity.position.distanceTo(item.position)
        if (dist > 2) {
          const goal = new goals.GoalNear(item.position.x, item.position.y, item.position.z, 1)
          await bot.pathfinder.goto(goal)
        }
        await new Promise(r => setTimeout(r, 200))
      } catch (e) {
        // Item picked up or despawned
      }
    }
    
    console.log('[ToolManager] ✅ Crafting table collected')
  } catch (e) {
    console.error('[ToolManager] Error picking up crafting table:', e.message)
  }
}

/**
 * Replace a broken tool automatically
 */
async function replaceBrokenTool(bot, brokenToolName) {
  try {
    const type = getToolType(brokenToolName)
    if (!type) {
      console.log(`[ToolManager] Unknown tool type: ${brokenToolName}`)
      return false
    }
    
    const brokenTier = getToolTier(brokenToolName)
    const minTier = brokenTier >= 0 ? TOOL_TIERS[brokenTier] : 'wooden'
    
    console.log(`[ToolManager] Tool broken: ${brokenToolName}, finding replacement...`)
    bot.chat(`⚠️ ${brokenToolName} broke!`)
    
    // Find best available tier
    const bestTier = getBestAvailableTier(bot, type, minTier)
    
    if (!bestTier) {
      console.log(`[ToolManager] No materials available to craft ${type}`)
      bot.chat(`❌ No materials for ${type}`)
      return false
    }
    
    // Craft replacement
    const success = await craftTool(bot, bestTier, type)
    
    if (success) {
      bot.chat(`✅ Crafted new ${bestTier} ${type}`)
      
      // Equip new tool
      const newTool = bot.inventory.items().find(i => 
        i.name.includes(bestTier) && i.name.includes(type)
      )
      if (newTool) {
        await bot.equip(newTool, 'hand')
      }
    }
    
    return success
  } catch (e) {
    console.error('[ToolManager] Error replacing tool:', e.message)
    return false
  }
}

/**
 * Check tool durability and warn/replace if needed
 */
function checkToolDurability(bot, tool) {
  if (!tool || !tool.nbt || !tool.nbt.value || !tool.nbt.value.Damage) {
    return { warning: false, critical: false, percentage: 100 }
  }
  
  const maxDurability = bot.registry.items[tool.type].maxDurability || 0
  if (maxDurability === 0) {
    return { warning: false, critical: false, percentage: 100 }
  }
  
  const damage = tool.nbt.value.Damage.value || 0
  const remaining = maxDurability - damage
  const percentage = (remaining / maxDurability) * 100
  
  return {
    warning: percentage <= DURABILITY_WARNING && percentage > DURABILITY_CRITICAL,
    critical: percentage <= DURABILITY_CRITICAL,
    percentage: Math.round(percentage)
  }
}

/**
 * Monitor equipped tool and auto-replace when broken
 */
function initToolMonitor(bot) {
  console.log('[ToolManager] Tool monitor initialized')
  
  let lastReplaceTime = 0
  const REPLACE_COOLDOWN = 5000 // 5 seconds cooldown to prevent spam
  
  // Listen for tool breaks
  bot.on('itemDrop', async (entity) => {
    // Skip if bot is doing a task (auto mining, etc.)
    if (bot.isDoingTask) {
      console.log('[ToolManager] Tool break detected but bot is doing task, skipping auto-replace')
      return
    }
    
    // This event fires when tools break and disappear
    const hand = bot.heldItem
    if (!hand) {
      // Tool might have just broken
      const lastTool = bot._lastEquippedTool
      if (lastTool) {
        const now = Date.now()
        if (now - lastReplaceTime > REPLACE_COOLDOWN) {
          lastReplaceTime = now
          await replaceBrokenTool(bot, lastTool)
        }
        bot._lastEquippedTool = null
      }
    }
  })
  
  // Track equipped tool
  bot.on('heldItemChanged', () => {
    const hand = bot.heldItem
    if (hand) {
      const type = getToolType(hand.name)
      if (type) {
        bot._lastEquippedTool = hand.name
      }
    }
  })
  
  // Periodic durability check with cooldown tracking
  const lastWarningTime = {}
  const WARNING_COOLDOWN = 60000 // Only warn once per minute per tool
  
  setInterval(() => {
    const hand = bot.heldItem
    if (!hand) return
    
    const type = getToolType(hand.name)
    if (!type) return
    
    const status = checkToolDurability(bot, hand)
    const now = Date.now()
    const lastWarn = lastWarningTime[hand.name] || 0
    
    if (status.critical && (now - lastWarn > WARNING_COOLDOWN)) {
      console.log(`[ToolManager] ⚠️ ${hand.name} is critical (${status.percentage}%)`)
      bot.chat(`⚠️ ${hand.name} almost broken (${status.percentage}%)`)
      lastWarningTime[hand.name] = now
    } else if (status.warning && (now - lastWarn > WARNING_COOLDOWN)) {
      console.log(`[ToolManager] ℹ️ ${hand.name} is low (${status.percentage}%)`)
      lastWarningTime[hand.name] = now
    }
  }, 5000) // Check every 5 seconds
}

/**
 * Manually craft a specific tool
 */
async function craftSpecificTool(bot, toolName) {
  const type = getToolType(toolName)
  const tier = getToolTier(toolName)
  
  if (!type || tier < 0) {
    console.log(`[ToolManager] Invalid tool name: ${toolName}`)
    return false
  }
  
  return await craftTool(bot, TOOL_TIERS[tier], type)
}

module.exports = {
  initToolMonitor,
  replaceBrokenTool,
  craftTool,
  craftSpecificTool,
  checkToolDurability,
  getBestAvailableTier,
  hasMaterialsForTool,
  getToolType,
  getToolTier
}
