/**
 * Task-Based Tool Selection Module
 * 
 * Automatically equips the correct tool for specific tasks:
 * - Wood/Logs → Axe (any tier)
 * - Stone/Ores → Pickaxe (stone+ for coal, iron+ for other ores)
 * - Dirt/Sand/Gravel → Shovel (any tier)
 * - Mobs/Combat → Sword (any tier)
 * - Crops → Hoe (any tier)
 * 
 * If the required tool is not available, attempts to craft one
 */

const { craftTool, getBestAvailableTier, hasMaterialsForTool } = require('./tool-manager.js')

/**
 * Block to tool mapping
 */
const BLOCK_TOOL_MAP = {
  // Wood blocks - require axe
  'oak_log': { tool: 'axe', minTier: 'wooden' },
  'birch_log': { tool: 'axe', minTier: 'wooden' },
  'spruce_log': { tool: 'axe', minTier: 'wooden' },
  'jungle_log': { tool: 'axe', minTier: 'wooden' },
  'acacia_log': { tool: 'axe', minTier: 'wooden' },
  'dark_oak_log': { tool: 'axe', minTier: 'wooden' },
  'mangrove_log': { tool: 'axe', minTier: 'wooden' },
  'cherry_log': { tool: 'axe', minTier: 'wooden' },
  'oak_planks': { tool: 'axe', minTier: 'wooden' },
  'crafting_table': { tool: 'axe', minTier: 'wooden' },
  'chest': { tool: 'axe', minTier: 'wooden' },
  'barrel': { tool: 'axe', minTier: 'wooden' },
  
  // Stone blocks - require pickaxe
  'stone': { tool: 'pickaxe', minTier: 'wooden' },
  'cobblestone': { tool: 'pickaxe', minTier: 'wooden' },
  'andesite': { tool: 'pickaxe', minTier: 'wooden' },
  'diorite': { tool: 'pickaxe', minTier: 'wooden' },
  'granite': { tool: 'pickaxe', minTier: 'wooden' },
  'deepslate': { tool: 'pickaxe', minTier: 'wooden' },
  'cobbled_deepslate': { tool: 'pickaxe', minTier: 'wooden' },
  
  // Ores - require pickaxe (coal = stone+, others = iron+)
  'coal_ore': { tool: 'pickaxe', minTier: 'stone' },
  'deepslate_coal_ore': { tool: 'pickaxe', minTier: 'stone' },
  'iron_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_iron_ore': { tool: 'pickaxe', minTier: 'iron' },
  'copper_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_copper_ore': { tool: 'pickaxe', minTier: 'iron' },
  'gold_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_gold_ore': { tool: 'pickaxe', minTier: 'iron' },
  'redstone_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_redstone_ore': { tool: 'pickaxe', minTier: 'iron' },
  'lapis_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_lapis_ore': { tool: 'pickaxe', minTier: 'iron' },
  'diamond_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_diamond_ore': { tool: 'pickaxe', minTier: 'iron' },
  'emerald_ore': { tool: 'pickaxe', minTier: 'iron' },
  'deepslate_emerald_ore': { tool: 'pickaxe', minTier: 'iron' },
  
  // Dirt/Sand/Gravel - require shovel
  'dirt': { tool: 'shovel', minTier: 'wooden' },
  'grass_block': { tool: 'shovel', minTier: 'wooden' },
  'podzol': { tool: 'shovel', minTier: 'wooden' },
  'mycelium': { tool: 'shovel', minTier: 'wooden' },
  'sand': { tool: 'shovel', minTier: 'wooden' },
  'red_sand': { tool: 'shovel', minTier: 'wooden' },
  'gravel': { tool: 'shovel', minTier: 'wooden' },
  'clay': { tool: 'shovel', minTier: 'wooden' },
  'soul_sand': { tool: 'shovel', minTier: 'wooden' },
  'soul_soil': { tool: 'shovel', minTier: 'wooden' },
  
  // Crops - require hoe
  'wheat': { tool: 'hoe', minTier: 'wooden' },
  'carrots': { tool: 'hoe', minTier: 'wooden' },
  'potatoes': { tool: 'hoe', minTier: 'wooden' },
  'beetroots': { tool: 'hoe', minTier: 'wooden' },
  'nether_wart': { tool: 'hoe', minTier: 'wooden' }
}

/**
 * Get tool tiers in order
 */
const TOOL_TIERS = ['wooden', 'stone', 'iron', 'golden', 'diamond', 'netherite']

/**
 * Get tier index
 */
function getTierIndex(tier) {
  return TOOL_TIERS.indexOf(tier)
}

/**
 * Check if a tier meets minimum requirement
 */
function meetsTierRequirement(currentTier, minTier) {
  const currentIndex = getTierIndex(currentTier)
  const minIndex = getTierIndex(minTier)
  return currentIndex >= minIndex
}

/**
 * Get the required tool for a block
 */
function getRequiredTool(blockName) {
  if (!blockName) return null
  
  // Check exact match
  if (BLOCK_TOOL_MAP[blockName]) {
    return BLOCK_TOOL_MAP[blockName]
  }
  
  // Check partial matches
  for (const [key, value] of Object.entries(BLOCK_TOOL_MAP)) {
    if (blockName.includes(key)) {
      return value
    }
  }
  
  return null
}

/**
 * Get the required tool for combat (always sword)
 */
function getRequiredToolForCombat() {
  return { tool: 'sword', minTier: 'wooden' }
}

/**
 * Find best tool in inventory for a specific tool type and tier requirement
 */
function findBestTool(bot, toolType, minTier = 'wooden') {
  const tools = bot.inventory.items().filter(item => {
    if (!item.name.includes(toolType)) return false
    
    // Extract tier from tool name
    for (const tier of TOOL_TIERS) {
      if (item.name.includes(tier)) {
        return meetsTierRequirement(tier, minTier)
      }
    }
    return false
  })
  
  if (tools.length === 0) return null
  
  // Sort by tier (highest first)
  tools.sort((a, b) => {
    const tierA = TOOL_TIERS.findIndex(t => a.name.includes(t))
    const tierB = TOOL_TIERS.findIndex(t => b.name.includes(t))
    return tierB - tierA
  })
  
  return tools[0]
}

/**
 * Ensure correct tool is equipped for a block
 */
async function ensureToolForBlock(bot, blockName, autoCraft = true) {
  const requirement = getRequiredTool(blockName)
  
  if (!requirement) {
    console.log(`[TaskTools] No specific tool required for ${blockName}`)
    return true
  }
  
  const { tool, minTier } = requirement
  console.log(`[TaskTools] Block ${blockName} requires ${minTier}+ ${tool}`)
  
  // Check if we already have the right tool equipped
  const equipped = bot.heldItem
  if (equipped && equipped.name.includes(tool)) {
    // Check if tier is sufficient
    for (const tier of TOOL_TIERS) {
      if (equipped.name.includes(tier)) {
        if (meetsTierRequirement(tier, minTier)) {
          console.log(`[TaskTools] Already equipped: ${equipped.name}`)
          return true
        } else {
          console.log(`[TaskTools] Current ${equipped.name} does not meet ${minTier} requirement`)
          break
        }
      }
    }
  }
  
  // Find best tool in inventory
  const bestTool = findBestTool(bot, tool, minTier)
  
  if (bestTool) {
    console.log(`[TaskTools] Equipping ${bestTool.name}`)
    await bot.equip(bestTool, 'hand')
    return true
  }
  
  // No suitable tool found
  console.log(`[TaskTools] No ${minTier}+ ${tool} found in inventory`)
  
  if (!autoCraft) {
    bot.chat(`❌ Need ${minTier}+ ${tool} for ${blockName}`)
    return false
  }
  
  // Try to craft one
  console.log(`[TaskTools] Attempting to craft ${minTier}+ ${tool}...`)
  bot.chat(`🔧 Crafting ${tool}...`)
  
  // Find best tier we can craft
  const bestCraftableTier = getBestAvailableTier(bot, tool, minTier)
  
  if (!bestCraftableTier) {
    console.log(`[TaskTools] No materials to craft ${minTier}+ ${tool}`)
    bot.chat(`❌ No materials for ${minTier}+ ${tool}`)
    return false
  }
  
  const success = await craftTool(bot, bestCraftableTier, tool)
  
  if (success) {
    bot.chat(`✅ Crafted ${bestCraftableTier} ${tool}`)
    
    // Equip the newly crafted tool
    const newTool = findBestTool(bot, tool, minTier)
    if (newTool) {
      await bot.equip(newTool, 'hand')
      console.log(`[TaskTools] Equipped new ${newTool.name}`)
    }
    return true
  }
  
  bot.chat(`❌ Failed to craft ${tool}`)
  return false
}

/**
 * Ensure correct tool is equipped for combat
 */
async function ensureToolForCombat(bot, autoCraft = true) {
  const { tool, minTier } = getRequiredToolForCombat()
  console.log(`[TaskTools] Combat requires ${minTier}+ ${tool}`)
  
  // Check if we already have a sword equipped
  const equipped = bot.heldItem
  if (equipped && equipped.name.includes('sword')) {
    console.log(`[TaskTools] Already equipped: ${equipped.name}`)
    return true
  }
  
  // Find best sword in inventory
  const bestSword = findBestTool(bot, 'sword', minTier)
  
  if (bestSword) {
    console.log(`[TaskTools] Equipping ${bestSword.name}`)
    await bot.equip(bestSword, 'hand')
    return true
  }
  
  // No sword found
  console.log(`[TaskTools] No sword found in inventory`)
  
  if (!autoCraft) {
    bot.chat(`❌ Need sword for combat`)
    return false
  }
  
  // Try to craft one
  console.log(`[TaskTools] Attempting to craft sword...`)
  bot.chat(`🔧 Crafting sword...`)
  
  const bestCraftableTier = getBestAvailableTier(bot, 'sword', minTier)
  
  if (!bestCraftableTier) {
    console.log(`[TaskTools] No materials to craft sword`)
    bot.chat(`❌ No materials for sword`)
    return false
  }
  
  const success = await craftTool(bot, bestCraftableTier, 'sword')
  
  if (success) {
    bot.chat(`✅ Crafted ${bestCraftableTier} sword`)
    const newSword = findBestTool(bot, 'sword', minTier)
    if (newSword) {
      await bot.equip(newSword, 'hand')
      console.log(`[TaskTools] Equipped new ${newSword.name}`)
    }
    return true
  }
  
  bot.chat(`❌ Failed to craft sword`)
  return false
}

/**
 * Validate tool before mining/breaking a block
 */
async function validateToolForTask(bot, blockOrTaskType, autoCraft = true) {
  // If it's a combat task
  if (blockOrTaskType === 'combat' || blockOrTaskType === 'mob') {
    return await ensureToolForCombat(bot, autoCraft)
  }
  
  // If it's a block
  return await ensureToolForBlock(bot, blockOrTaskType, autoCraft)
}

/**
 * Get tool requirement info for display
 */
function getToolRequirementInfo(blockName) {
  const requirement = getRequiredTool(blockName)
  if (!requirement) return 'No specific tool required'
  
  return `Requires ${requirement.minTier}+ ${requirement.tool}`
}

module.exports = {
  ensureToolForBlock,
  ensureToolForCombat,
  validateToolForTask,
  getRequiredTool,
  getRequiredToolForCombat,
  findBestTool,
  getToolRequirementInfo,
  meetsTierRequirement,
  BLOCK_TOOL_MAP
}
