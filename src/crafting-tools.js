const { ensureCraftingTableOpen } = require('./crafting-recipes.js')

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
    
    // For crafting table recipes (2x2+), we MUST open the table FIRST
    // before we can find the recipes
    let recipes = []
    let usingCraftingTable = false
    
    // Try to find and open crafting table FIRST (don't check recipes yet)
    // This is necessary because table recipes only appear when window is open
    const craftingTable = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 5,
      count: 1
    })
    
    if (craftingTable) {
      console.log(`[Crafting] Found crafting table, opening for recipe lookup...`)
      try {
        await bot.openBlock(craftingTable)
        console.log(`[Crafting] Table opened`)
        usingCraftingTable = true
      } catch (openErr) {
        console.log(`[Crafting] Could not open table:`, openErr.message)
      }
    }
    
    // NOW try to get recipes with window open
    if (bot.currentWindow && bot.currentWindow.type === 'minecraft:crafting') {
      console.log(`[Crafting] Crafting table window is open, searching recipes...`)
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
    
    // Now craft with appropriate context
    if (usingCraftingTable && craftingTable) {
      console.log(`[Crafting] Crafting with table window open...`)
      await bot.craft(recipes[0], amount, craftingTable)
    } else {
      console.log(`[Crafting] Crafting in inventory...`)
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

  // Helper counters
  const count = (frag) => bot.inventory.items().filter(i => i.name && i.name.includes(frag)).reduce((s,it)=>s+it.count,0)
  const has = name => bot.inventory.items().some(i => i.name === name)

  // Gather logs if we lack planks/sticks
  async function gatherLogs(minLogs = 3) {
    const pathfinderPkg = require('mineflayer-pathfinder')
    const { Movements, goals } = pathfinderPkg
    const { createLeafDigMovements } = require('./movement.js')
    let attempts = 0
    while (count('log') < minLogs && attempts < 10) {
      attempts++
      const logBlock = bot.findBlock({ matching: b => b && b.name && b.name.includes('log'), maxDistance: 24, count:1 })
      if (!logBlock) break
      try {
        const dist = bot.entity.position.distanceTo(logBlock.position)
        if (dist > 3) {
          const movements = createLeafDigMovements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(logBlock.position.x, logBlock.position.y, logBlock.position.z, 1.5)
          await bot.pathfinder.goto(goal)
        }
        const blk = bot.blockAt(logBlock.position)
        if (blk && blk.diggable) {
          const dropPos = blk.position.clone()
          bot._isDigging = true
          await bot.dig(blk)
          bot._isDigging = false
          // Move closer to drop position to pick up items
          await new Promise(r=>setTimeout(r,200))
          try {
            const goal = new goals.GoalNear(dropPos.x, dropPos.y, dropPos.z, 1)
            await bot.pathfinder.goto(goal)
          } catch(e){}
          // Wait for pickup
          await new Promise(r=>setTimeout(r,500))
        }
      } catch(e){ bot._isDigging = false }
    }
  }

  // Craft planks & sticks if missing
  if (count('planks') < 3 || count('stick') < 2) {
    if (count('planks') < 3 || count('stick') < 2) {
      if (count('log') < 2) await gatherLogs(3)
    }
    // Craft planks from logs (use up to 3 logs)
    try {
      const { craftPlanksFromLogs, craftSticks } = require('./crafting-recipes.js')
      const logsToUse = Math.min(count('log'), 3)
      if (logsToUse > 0 && count('planks') < 3) {
        await craftPlanksFromLogs(bot, logsToUse)
        await new Promise(r=>setTimeout(r,200))
      }
      if (count('stick') < 2 && count('planks') >= 2) {
        await craftSticks(bot, 1)
        await new Promise(r=>setTimeout(r,200))
      }
    } catch(e){ console.log('[Crafting] Pre-craft error (planks/sticks):', e.message) }
  }

  // Ensure crafting table (craft & place if absent)
  const tableBlock = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance:6, count:1 })
  if (!tableBlock) {
    // Craft table if we have 4 planks and none in inventory
    if (!has('crafting_table') && count('planks') >= 4) {
      try {
        const item = bot.registry.itemsByName['crafting_table']
        if (item) {
          const recipes = bot.recipesFor(item.id, null, 1, null)
          if (recipes && recipes.length > 0) {
            await bot.craft(recipes[0], 1)
            await new Promise(r=>setTimeout(r,200))
          }
        }
      } catch(e){ console.log('[Crafting] Crafting table craft failed:', e.message) }
    }
    // Place table if we have it
    const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
    if (tableItem) {
      try {
        await bot.equip(tableItem,'hand')
        const ground = bot.blockAt(bot.entity.position.offset(0,-1,0))
        if (ground) await bot.placeBlock(ground,{x:0,y:1,z:0})
        await new Promise(r=>setTimeout(r,300))
      } catch(e){ console.log('[Crafting] Could not place crafting table:', e.message) }
    }
  }

  // Refresh materials after pre-crafting
  const allPlanks = bot.inventory.items().filter(i => i.name && i.name.includes('planks'))
  const planks = allPlanks.length > 0 ? allPlanks[0] : null
  const totalPlanks = allPlanks.reduce((sum, item) => sum + item.count, 0)
  const sticks = bot.inventory.items().find(i => i.name === 'stick')
  
  console.log('[CraftPickaxe] All planks in inventory:', allPlanks.map(p => `${p.name}:${p.count}`).join(', '))
  console.log('[CraftPickaxe] Total planks:', totalPlanks)
  console.log('[CraftPickaxe] Planks for crafting:', planks ? `${planks.name}:${planks.count}` : 'none')
  console.log('[CraftPickaxe] Sticks:', sticks ? `${sticks.name}:${sticks.count}` : 'none')
  
  if (!planks || planks.count < 3 || !sticks || sticks.count < 2) {
    console.log('[CraftPickaxe] Insufficient materials for pickaxe after prep')
    return false
  }

  // Re-find crafting table (might have been placed above)
  let craftingTable = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance:6, count:1 })
  if (!craftingTable) {
    console.log('[CraftPickaxe] No crafting table found')
    return false
  }

  try {
    console.log('[CraftPickaxe] Opening crafting table for wooden pickaxe...')
    await bot.openBlock(craftingTable)
    await new Promise(r => setTimeout(r, 300))
    
    if (!bot.currentWindow) {
      console.log('[CraftPickaxe] Failed to open crafting table window')
      return false
    }
    
    console.log('[CraftPickaxe] Looking for recipes, window type:', bot.currentWindow.type)
    
    // Get the SPECIFIC plank type from inventory (oak_planks, birch_planks, etc.)
    const allPlanks = bot.inventory.items().filter(i => i.name && i.name.includes('planks'))
    if (allPlanks.length === 0) {
      console.log('[CraftPickaxe] No planks found in inventory')
      if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
      return false
    }
    
    const plankItem = allPlanks[0] // Use first available plank type
    console.log('[CraftPickaxe] Using plank type:', plankItem.name)
    
    // Get wooden_pickaxe item ID
    const pickaxeItem = bot.registry.itemsByName['wooden_pickaxe']
    if (!pickaxeItem) {
      console.log('[CraftPickaxe] wooden_pickaxe not found in registry')
      if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
      return false
    }
    
    // Get recipes using the SPECIFIC plank item ID (not generic planks)
    let recipes = bot.recipesFor(pickaxeItem.id, null, 1, craftingTable)
    console.log('[CraftPickaxe] Recipes found with table:', recipes ? recipes.length : 0)
    
    if (!recipes || recipes.length === 0) {
      console.log('[CraftPickaxe] No recipes found for wooden_pickaxe')
      console.log('[CraftPickaxe] Debug: pickaxe ID:', pickaxeItem.id, 'plank type:', plankItem.name)
      // Close window
      if (bot.currentWindow) bot.closeWindow(bot.currentWindow)
      return false
    }
    
    // Craft with the table
    console.log('[CraftPickaxe] Crafting wooden pickaxe...')
    await bot.craft(recipes[0], 1, craftingTable)
    console.log('[CraftPickaxe] ✅ Crafted wooden pickaxe')
    
    // Close window
    if (bot.currentWindow) {
      bot.closeWindow(bot.currentWindow)
      await new Promise(r => setTimeout(r, 200))
    }
    
    return true
  } catch (e) {
    console.error('[CraftPickaxe] Wooden pickaxe craft error:', e.message)
    if (bot.currentWindow) {
      try { bot.closeWindow(bot.currentWindow) } catch(_) {}
    }
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
  
  console.log(`[Crafting] Axe materials: planks=${planks ? planks.count : 0}, sticks=${sticks ? sticks.count : 0}`)
  
  if (!planks || planks.count < 3 || !sticks || sticks.count < 2) {
    console.log('[Crafting] Insufficient materials for axe')
    return false
  }
  
  try {
    // Find the crafting table block
    const craftingTable = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 5,
      count: 1
    })
    
    if (!craftingTable) {
      console.log('[Crafting] No crafting table found nearby for axe crafting')
      return false
    }
    
    // Check if crafting table window is already open
    if (bot.currentWindow && bot.currentWindow.type === 'minecraft:crafting') {
      console.log('[Crafting] Crafting table window already open, proceeding with craft...')
    } else {
      console.log('[Crafting] Opening crafting table for axe...')
      await bot.openBlock(craftingTable)
      await new Promise(r => setTimeout(r, 500))
    }
    
    // Now craft the axe directly with the crafting table reference
    const axeItem = bot.registry.itemsByName['wooden_axe']
    if (!axeItem) {
      console.log('[Crafting] Wooden axe not found in registry')
      return false
    }
    
    const recipes = bot.recipesFor(axeItem.id, null, 1, craftingTable)
    if (!recipes || recipes.length === 0) {
      console.log('[Crafting] No recipes found for wooden axe')
      return false
    }
    
    await bot.craft(recipes[0], 1, craftingTable)
    console.log('[Crafting] Wooden axe crafted successfully')
    await new Promise(r => setTimeout(r, 500))
    return true
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
