/**
 * Tool Crafting Module
 * Handles creation of axes, pickaxes and tool validation
 */

/**
 * Check if bot has pickaxe
 */
function hasPickaxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name && (
    i.name === 'wooden_pickaxe' ||
    i.name === 'stone_pickaxe' ||
    i.name === 'iron_pickaxe' ||
    i.name === 'diamond_pickaxe'
  ))
}

/**
 * Check if bot has iron pickaxe
 */
function hasIronPickaxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name === 'iron_pickaxe')
}

/**
 * Check if bot has stone pickaxe
 */
function hasStonePickaxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name === 'stone_pickaxe')
}

/**
 * Check if bot has any axe
 */
function hasAxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name && (
    i.name === 'wooden_axe' ||
    i.name === 'stone_axe' ||
    i.name === 'iron_axe' ||
    i.name === 'diamond_axe'
  ))
}

/**
 * Get best available axe from inventory
 */
function getBestAxe(bot) {
  const items = bot.inventory.items()
  const axes = items.filter(i => i.name && i.name.includes('axe'))
  
  if (axes.length === 0) return null
  
  const order = ['diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
  for (const name of order) {
    const axe = axes.find(a => a.name === name)
    if (axe) return axe
  }
  
  return axes[0]
}

/**
 * Generic tool crafting with fallback names
 */
async function tryCraft(bot, itemName, amount = 1, fallbackNames = []) {
  try {
    let item = bot.registry.itemsByName[itemName]
    let actualName = itemName
    
    // Try fallback names if primary not found
    if (!item && fallbackNames.length > 0) {
      for (const fallback of fallbackNames) {
        item = bot.registry.itemsByName[fallback]
        if (item) {
          actualName = fallback
          break
        }
      }
    }
    
    if (!item) {
      // Last resort: search for any item containing the base name
      const baseSearch = itemName.split('_')[0]  // e.g. "wooden" from "wooden_axe"
      console.log(`[Crafting] ${itemName} not found, searching for items with '${baseSearch}'...`)
      
      for (const [regName, regItem] of Object.entries(bot.registry.itemsByName)) {
        if (regName.includes(baseSearch) && regName.includes('axe')) {
          console.log(`[Crafting] Found match: ${regName}`)
          item = regItem
          actualName = regName
          break
        }
      }
    }
    
    if (!item) {
      console.log(`[Crafting] Item ${itemName} not in registry (tried: ${fallbackNames.join(', ')})`)
      return false
    }
    
    // Try with opened window first (for crafting table recipes)
    let recipes = []
    
    // If any crafting window is open, get recipes from current window
    if (bot.currentWindow) {
      console.log(`[Crafting] Window open (${bot.currentWindow.type}), searching recipes in window...`)
      try {
        recipes = bot.recipesFor(item.id, null, 1, bot.currentWindow)
      } catch (e) {
        console.log(`[Crafting] Error searching window recipes:`, e.message)
        recipes = []
      }
    }
    
    // If no recipes found in window, try inventory recipes
    if (!recipes || recipes.length === 0) {
      console.log(`[Crafting] No window recipes, trying inventory recipes...`)
      recipes = bot.recipesFor(item.id, null, 1, null)
    }
    
    if (!recipes || recipes.length === 0) {
      // Last resort: search all recipes in registry for this item
      console.log(`[Crafting] No inventory recipes either, searching all recipes...`)
      const allRecipes = bot.recipesFor(item.id)
      if (allRecipes && allRecipes.length > 0) {
        console.log(`[Crafting] Found ${allRecipes.length} recipe(s) in all recipes`)
        recipes = allRecipes
      } else {
        console.log(`[Crafting] No recipe for ${actualName}`)
        return false
      }
    }
    
    // If recipe requires table, we need to pass it to bot.craft
    if (recipes[0] && recipes[0].requiresTable) {
      console.log(`[Crafting] Recipe requires crafting table, finding one...`)
      const craftingTable = bot.findBlock({
        matching: b => b && b.name === 'crafting_table',
        maxDistance: 5,
        count: 1
      })
      
      if (!craftingTable) {
        console.log(`[Crafting] No crafting table found for recipe`)
        return false
      }
      
      await bot.craft(recipes[0], amount, craftingTable)
    } else {
      await bot.craft(recipes[0], amount)
    }
    
    console.log(`[Crafting] Crafted ${amount}x ${actualName}`)
    return true
  } catch (e) {
    console.error(`[Crafting] Error crafting ${itemName}:`, e.message)
    return false
  }
}

/**
 * Ensure wooden pickaxe is available
 */
async function ensureWoodenPickaxe(bot) {
  if (hasPickaxe(bot)) return true
  
  console.log('[Crafting] Attempting to craft wooden pickaxe...')
  
  const planks = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
  const sticks = bot.inventory.items().find(i => i.name === 'stick')
  
  if (!planks || !sticks) {
    console.log('[Crafting] Insufficient materials for pickaxe')
    return false
  }
  
  try {
    return await tryCraft(bot, 'wooden_pickaxe', 1, ['pickaxe', 'oak_pickaxe'])
  } catch (e) {
    console.error('[Crafting] Wooden pickaxe craft failed:', e.message)
    return false
  }
}

/**
 * Ensure wooden axe is available
 */
async function ensureWoodenAxe(bot) {
  if (hasAxe(bot)) return true
  
  console.log('[Crafting] Attempting to craft wooden axe...')
  
  const planks = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
  const sticks = bot.inventory.items().find(i => i.name === 'stick')
  
  if (!planks || planks.count < 3 || !sticks || sticks.count < 2) {
    console.log('[Crafting] Insufficient materials for axe')
    return false
  }
  
  try {
    // Try wooden_axe first, then fallback names
    return await tryCraft(bot, 'wooden_axe', 1, ['axe', 'oak_axe'])
  } catch (e) {
    console.error('[Crafting] Wooden axe craft failed:', e.message)
    return false
  }
}

/**
 * Ensure stone pickaxe is available
 */
async function ensureStonePickaxe(bot) {
  if (hasStonePickaxe(bot)) return true
  
  console.log('[Crafting] Attempting to craft stone pickaxe...')
  
  const cobblestone = bot.inventory.items().find(i => i.name === 'cobblestone')
  const sticks = bot.inventory.items().find(i => i.name === 'stick')
  
  if (!cobblestone || cobblestone.count < 3 || !sticks || sticks.count < 2) {
    console.log('[Crafting] Insufficient cobblestone/sticks for stone pickaxe')
    return false
  }
  
  try {
    return await tryCraft(bot, 'stone_pickaxe', 1)
  } catch (e) {
    console.error('[Crafting] Stone pickaxe craft failed:', e.message)
    return false
  }
}

/**
 * Ensure iron pickaxe is available
 */
async function ensureIronPickaxe(bot) {
  if (hasIronPickaxe(bot)) return true
  
  console.log('[Crafting] Attempting to craft iron pickaxe...')
  
  const ironIngots = bot.inventory.items().find(i => i.name === 'iron_ingot')
  const sticks = bot.inventory.items().find(i => i.name === 'stick')
  
  if (!ironIngots || ironIngots.count < 3 || !sticks || sticks.count < 2) {
    console.log('[Crafting] Insufficient iron ingots for pickaxe')
    return false
  }
  
  try {
    return await tryCraft(bot, 'iron_pickaxe', 1)
  } catch (e) {
    console.error('[Crafting] Iron pickaxe craft failed:', e.message)
    return false
  }
}

/**
 * Ensure appropriate tool for task
 */
async function ensureToolFor(bot, task) {
  if (task === 'wood' || task === 'log') {
    return hasAxe(bot) || await ensureWoodenAxe(bot)
  } else if (task === 'stone') {
    return hasPickaxe(bot) || await ensureWoodenPickaxe(bot)
  } else if (task === 'ore' || task === 'iron') {
    return hasStonePickaxe(bot) || await ensureStonePickaxe(bot)
  }
  return hasPickaxe(bot)
}

module.exports = {
  hasPickaxe,
  hasIronPickaxe,
  hasStonePickaxe,
  hasAxe,
  getBestAxe,
  tryCraft,
  ensureWoodenPickaxe,
  ensureWoodenAxe,
  ensureStonePickaxe,
  ensureIronPickaxe,
  ensureToolFor
}
