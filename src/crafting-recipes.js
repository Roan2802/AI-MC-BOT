/**
 * Recipe Crafting Module
 * Handles specific recipes like planks, sticks, fuel, etc.
 */

/**
 * Open crafting table for recipes that need it
 */
async function ensureCraftingTableOpen(bot) {
  try {
    // Find and open the crafting table
    const craftingTable = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 5,
      count: 1
    })
    
    if (craftingTable) {
      console.log('[Crafting] Found crafting table, opening...')
      await bot.openBlock(craftingTable)
      console.log('[Crafting] Crafting table opened')
      return true
    }
    
    console.log('[Crafting] No crafting table found to open')
    return false
  } catch (e) {
    console.log('[Crafting] Could not open crafting table:', e.message)
    return false
  }
}

/**
 * Craft planks from logs
 */
async function craftPlanksFromLogs(bot, logsToUse = 1) {
  try {
    const logs = bot.inventory.items().find(i => i.name && i.name.includes('log'))
    if (!logs) {
      console.log('[Crafting] No logs to craft planks')
      return 0
    }

    const logType = logs.name
    const plankType = logType.replace('_log', '_planks')
    const plankItemId = bot.registry.itemsByName[plankType]
    
    if (!plankItemId || typeof plankItemId.id !== 'number') {
      console.log('[Crafting] Plank type not found:', plankType)
      return 0
    }
    
    const recipes = bot.recipesFor(plankItemId.id, null, 1, null)
    if (!recipes || recipes.length === 0) {
      console.log('[Crafting] No recipes for planks')
      return 0
    }

    const toCraft = Math.min(logsToUse, logs.count)
    await bot.craft(recipes[0], toCraft)
    console.log(`[Crafting] Crafted ${toCraft * 4} planks from ${toCraft} logs`)
    return toCraft * 4
  } catch (e) {
    console.error('[Crafting] Craft planks error:', e.message)
    return 0
  }
}

/**
 * Craft sticks from planks
 */
async function craftSticks(bot, count = 4) {
  try {
    let planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
    if (!planks) {
      console.log('[Crafting] No planks to craft sticks')
      return 0
    }

    const stickItemId = bot.registry.itemsByName.stick
    if (!stickItemId || typeof stickItemId.id !== 'number') {
      console.log('[Crafting] Stick item not found')
      return 0
    }

    const recipes = bot.recipesFor(stickItemId.id, null, 1, null)
    if (!recipes || recipes.length === 0) {
      console.log('[Crafting] No recipes for sticks')
      return 0
    }

    const toCraft = Math.min(count, Math.floor(planks.count / 2))
    await bot.craft(recipes[0], toCraft)
    console.log(`[Crafting] Crafted ${toCraft * 4} sticks`)
    return toCraft * 4
  } catch (e) {
    console.error('[Crafting] Craft sticks error:', e.message)
    return 0
  }
}

/**
 * Ensure fuel is available in furnace
 */
async function ensureFuel(bot) {
  try {
    // Check for charcoal or coal in inventory
    const charcoal = bot.inventory.items().find(i => i.name === 'charcoal')
    const coal = bot.inventory.items().find(i => i.name === 'coal')
    
    if (charcoal || coal) {
      console.log('[Crafting] Fuel already available')
      return true
    }
    
    // Try to make charcoal from logs
    const logs = bot.inventory.items().find(i => i.name && i.name.includes('log'))
    if (!logs) {
      console.log('[Crafting] No logs for charcoal')
      return false
    }
    
    console.log('[Crafting] No fuel, need to smelt charcoal')
    // This would need furnace access - handled elsewhere
    return false
  } catch (e) {
    console.error('[Crafting] ensureFuel error:', e.message)
    return false
  }
}

/**
 * Craft chest
 */
async function craftChest(bot, count = 1) {
  try {
    const planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
    if (!planks || planks.count < 8) {
      console.log('[Crafting] Not enough planks for chest (need 8)')
      return false
    }

    const chestItemId = bot.registry.itemsByName['chest']
    if (!chestItemId || typeof chestItemId.id !== 'number') {
      console.log('[Crafting] Chest item not found')
      return false
    }

    const recipes = bot.recipesFor(chestItemId.id, null, 1, null)
    if (!recipes || recipes.length === 0) {
      console.log('[Crafting] No recipes for chest')
      return false
    }

    await bot.craft(recipes[0], count)
    console.log(`[Crafting] Crafted ${count} chest(s)`)
    return true
  } catch (e) {
    console.error('[Crafting] Craft chest error:', e.message)
    return false
  }
}

/**
 * Craft charcoal from logs (via furnace)
 */
async function craftCharcoal(bot, count = 1) {
  try {
    const logs = bot.inventory.items().find(i => i.name && i.name.includes('log'))
    if (!logs || logs.count < count) {
      console.log('[Crafting] Not enough logs for charcoal')
      return 0
    }

    console.log('[Crafting] Charcoal smelting needs furnace - must be done via furnace module')
    return 0
  } catch (e) {
    console.error('[Crafting] Craft charcoal error:', e.message)
    return 0
  }
}

module.exports = {
  ensureCraftingTableOpen,
  craftPlanksFromLogs,
  craftSticks,
  ensureFuel,
  craftChest,
  craftCharcoal
}
