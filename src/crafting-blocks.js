/**
 * Block Crafting Module
 * Handles crafting tables and furnaces placement/creation
 */

const pathfinderPkg = require('mineflayer-pathfinder')
const { goals } = pathfinderPkg

/**
 * Place crafting table at nearby position
 */
async function placeCraftingTable(bot) {
  try {
    const craftingTable = bot.inventory.items().find(i => i.name === 'crafting_table')
    
    if (!craftingTable) {
      console.log('[Crafting] No crafting table in inventory')
      return false
    }
    
    // Try to find suitable ground around bot in a radius
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        const checkPos = bot.entity.position.offset(dx, 0, dz)
        const groundBlock = bot.blockAt(checkPos.offset(0, -1, 0))
        const topBlock = bot.blockAt(checkPos)
        
        // Check if ground exists and top is air
        if (groundBlock && groundBlock.name !== 'air' && topBlock && topBlock.name === 'air') {
          try {
            await bot.equip(craftingTable, 'hand')
            await bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 })
            console.log('[Crafting] Crafting table placed at', Math.floor(checkPos.x), Math.floor(checkPos.z))
            await new Promise(r => setTimeout(r, 300))
            return true
          } catch (e) {
            // Try next position
          }
        }
      }
    }
    
    console.log('[Crafting] No suitable ground to place crafting table nearby')
    return false
  } catch (e) {
    console.error('[Crafting] Place crafting table failed:', e.message)
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
    
    // Try to place one
    const planks = bot.inventory.items().find(i => i && i.name && i.name.includes('planks'))
    if (!planks || planks.count < 4) {
      console.log('[Crafting] Not enough planks for crafting table')
      return false
    }
    
    console.log('[Crafting] Crafting table not found, crafting one...')
    
    // Craft crafting table
    try {
      const tableItemId = bot.registry.itemsByName['crafting_table']
      if (tableItemId && typeof tableItemId.id === 'number') {
        const recipes = bot.recipesFor(tableItemId.id, null, 1, null)
        if (recipes && recipes.length > 0) {
          await bot.craft(recipes[0], 1)
          console.log('[Crafting] Crafting table crafted')
          await new Promise(r => setTimeout(r, 300))
          
          // Place it
          return await placeCraftingTable(bot)
        }
      }
    } catch (e) {
      console.log('[Crafting] Failed to craft table:', e.message)
    }
    
    return false
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
