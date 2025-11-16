/**
 * Crafting helper utilities
 *
 * Provides a small set of helpers to ensure the bot has basic tools
 * and can craft a wooden pickaxe when possible. This is intentionally
 * conservative and aims to work with common inventories (logs -> planks -> crafting_table -> wooden_pickaxe).
 */

import fs from 'fs'
import { Vec3 } from 'vec3'

/**
 * Check whether the bot already has any pickaxe in inventory.
 * @param {import('mineflayer').Bot} bot
 * @returns {boolean}
 */
export function hasPickaxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name && i.name.includes('pickaxe'))
}

/**
 * Try to craft an item by name using available recipes.
 * This wrapper will attempt to find a recipe and call bot.craft.
 * If a recipe requires a crafting table and none is available, it will
 * try to craft a crafting table first (from planks) if possible.
 * @param {import('mineflayer').Bot} bot
 * @param {string} itemName
 * @param {number} amount
 * @returns {Promise<boolean>} true if crafted
 */
export async function tryCraft(bot, itemName, amount = 1) {
  try {
    // recipesFor accepts itemId or item name
    const recipes = bot.recipesAll ? bot.recipesAll(itemName) : bot.recipesFor(itemName, null, 1)
    if (!recipes || recipes.length === 0) return false

    // pick the first usable recipe
    const recipe = recipes.find(r => true) || recipes[0]

    // if recipe needs a crafting table, ensure we have one
    if (recipe.requiresTable) {
      const hasTable = bot.inventory.items().some(it => it.name === 'crafting_table')
      if (!hasTable) {
        // try craft a crafting_table (4 planks)
        const tableRec = bot.recipesAll ? bot.recipesAll('crafting_table') : bot.recipesFor('crafting_table', null, 1)
        if (!tableRec || tableRec.length === 0) return false
        await bot.craft(tableRec[0], 1)
      }

      // Try to find an existing crafting table block nearby to use as crafting station
      const findTableBlock = () => {
        const p = bot.entity.position
        for (let dx = -2; dx <= 2; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -2; dz <= 2; dz++) {
              const b = bot.blockAt(p.offset(dx, dy, dz))
              if (b && (b.name === 'crafting_table' || b.name === 'workbench')) return b
            }
          }
        }
        return null
      }

      // Always prefer to place a local crafting table and craft on it
      // If we already have a table block nearby, we will still place a new one
      // to ensure predictable placement.
      try {
        // If no crafting table item in inventory, try to craft one
        const hasTableItem = bot.inventory.items().some(it => it.name === 'crafting_table')
        if (!hasTableItem) {
          const tableRec = bot.recipesAll ? bot.recipesAll('crafting_table') : bot.recipesFor('crafting_table', null, 1)
          if (tableRec && tableRec.length > 0) {
            await bot.craft(tableRec[0], 1)
          }
        }

        // attempt to place a crafting table adjacent to bot
        const placed = await placeCraftingTable(bot)
        if (placed) {
          // find the newly placed table and craft using it
          tableBlock = findTableBlock()
        }
      } catch (e) {
        // ignore placement errors and fall back
      }

      if (tableBlock) {
        await bot.craft(recipe, amount, tableBlock)
      } else {
        // fallback: craft in inventory (may fail on some servers)
        await bot.craft(recipe, amount)
      }
    } else {
      await bot.craft(recipe, amount)
    }
    return true
  } catch (e) {
    console.warn('[Crafting] craft failed', e && e.message)
    return false
  }
}

/**
 * Ensure the bot has at least a wooden pickaxe. Attempts to craft from logs/planks if necessary.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if a pickaxe is available after the call
 */
export async function ensureWoodenPickaxe(bot) {
  if (hasPickaxe(bot)) return true

  // Try to craft wooden_pickaxe
  // First, try to make planks from logs if needed
  const hasPlanks = bot.inventory.items().some(i => i.name && i.name.includes('planks'))
  const hasLogs = bot.inventory.items().some(i => i.name && i.name.includes('log'))
  try {
    if (!hasPlanks && hasLogs) {
      // convert one log to planks by crafting (some servers allow it in inventory)
      const plankRec = bot.recipesAll ? bot.recipesAll('planks') : bot.recipesFor('planks', null, 1)
      if (plankRec && plankRec.length > 0) {
        await bot.craft(plankRec[0], 1)
      }
    }

    // Note: automatic mining of logs is handled by `src/inventory.js` to avoid
    // circular imports. This function only attempts to craft from existing
    // inventory (logs/planks) and crafting recipes.

    // Now try to craft wooden_pickaxe (may require crafting table)
    const success = await tryCraft(bot, 'wooden_pickaxe', 1)
    return success || hasPickaxe(bot)
  } catch (e) {
    console.warn('[Crafting] ensureWoodenPickaxe failed', e && e.message)
    return hasPickaxe(bot)
  }
}

/**
 * Check whether the bot has any axe in inventory.
 * @param {import('mineflayer').Bot} bot
 * @returns {boolean}
 */
export function hasAxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name && i.name.includes('axe'))
}

/**
 * Ensure the bot has at least a wooden axe. Attempts to craft from planks if necessary.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>}
 */
export async function ensureWoodenAxe(bot) {
  if (hasAxe(bot)) return true
  try {
    const success = await tryCraft(bot, 'wooden_axe', 1)
    return success || hasAxe(bot)
  } catch (e) {
    console.warn('[Crafting] ensureWoodenAxe failed', e && e.message)
    return hasAxe(bot)
  }
}

/**
 * Ensure appropriate tool exists for a task.
 * @param {import('mineflayer').Bot} bot
 * @param {string} task - 'wood'|'stone' etc.
 * @returns {Promise<boolean>} true if suitable tool is available
 */
export async function ensureToolFor(bot, task) {
  if (task === 'wood') {
    return ensureWoodenAxe(bot)
  }
  if (task === 'ore') {
    // For ore: prefer iron pickaxe, fallback to stone/wooden
    return ensureIronPickaxe(bot)
  }
  if (task === 'stone') {
    return ensureStonePickaxe(bot)
  }
  // default to pickaxe for other mining tasks
  return ensureWoodenPickaxe(bot)

}


/**
 * Place a crafting table near the bot. Requires a crafting_table item in inventory.
 * Attempts to find a nearby solid block to place the table on. Returns true on success.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>}
 */
export async function placeCraftingTable(bot) {
  try {
    const tableItem = bot.inventory.items().find(i => i.name === 'crafting_table')
    if (!tableItem) return false

    // find a block to place on (prefer block under feet)
    const around = [ [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1] ]
    let ref = null
    for (const off of around) {
      const b = bot.blockAt(bot.entity.position.offset(off[0], off[1], off[2]))
      if (b && b.name !== 'air') { ref = b; break }
    }
    if (!ref) return false

    // equip the crafting table and place it
    await bot.equip(tableItem, 'hand')
    await bot.placeBlock(ref, new Vec3(0, 1, 0))
    return true
  } catch (e) {
    console.warn('[Crafting] placeCraftingTable failed:', e && e.message)
    return false
  }
}

/**
 * Place a furnace near the bot. Requires a furnace item in inventory.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if placed
 */
export async function placeFurnace(bot) {
  try {
    const furnaceItem = bot.inventory.items().find(i => i.name && i.name.includes('furnace'))
    if (!furnaceItem) return false

    // find a block to place on (prefer block under feet)
    const around = [ [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1] ]
    let ref = null
    for (const off of around) {
      const b = bot.blockAt(bot.entity.position.offset(off[0], off[1], off[2]))
      if (b && b.name !== 'air') { ref = b; break }
    }
    if (!ref) return false

    await bot.equip(furnaceItem, 'hand')
    await bot.placeBlock(ref, new Vec3(0, 1, 0))
    return true
  } catch (e) {
    console.warn('[Crafting] placeFurnace failed:', e && e.message)
    return false
  }
}

/**
 * Ensure there is a furnace available: find nearby furnace block, or craft+place one.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if furnace block is available
 */
export async function ensureFurnace(bot) {
  // quick scan for furnace block
  const p = bot.entity.position
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        const b = bot.blockAt(p.offset(dx, dy, dz))
        if (b && b.name && b.name.includes('furnace')) return true
      }
    }
  }

  // Try to craft a furnace if we have cobblestone
  try {
    const cobble = bot.inventory.items().find(i => i.name && (i.name === 'cobblestone' || i.name === 'stone'))
    if (!cobble) return false

    const recipes = bot.recipesAll ? bot.recipesAll('furnace') : bot.recipesFor('furnace', null, 1)
    if (recipes && recipes.length > 0) {
      // ensure crafting table if required
      const recipe = recipes[0]
      if (recipe.requiresTable) {
        // try to craft/place crafting table
        const hasTableItem = bot.inventory.items().some(it => it.name === 'crafting_table')
        if (!hasTableItem) {
          const tableRec = bot.recipesAll ? bot.recipesAll('crafting_table') : bot.recipesFor('crafting_table', null, 1)
          if (tableRec && tableRec.length > 0) {
            await bot.craft(tableRec[0], 1)
          }
        }
        // place table if needed
        try { await placeCraftingTable(bot) } catch (_) {}
      }

      // craft the furnace
      try {
        await bot.craft(recipe, 1)
      } catch (e) {
        // crafting may fail on some servers; continue to attempt placement if we somehow have a furnace item
      }
    }

    // if we now have a furnace item, place it
    const hasFurnaceItem = bot.inventory.items().some(i => i.name && i.name.includes('furnace'))
    if (hasFurnaceItem) {
      const placed = await placeFurnace(bot)
      return placed
    }
  } catch (e) {
    console.warn('[Crafting] ensureFurnace error:', e && e.message)
  }
  return false
}

/**
 * Try to craft planks from logs in inventory.
 * @param {import('mineflayer').Bot} bot
 * @param {number} logsToUse
 * @returns {Promise<boolean>} true if crafted planks
 */
export async function craftPlanksFromLogs(bot, logsToUse = 1) {
  try {
    const plankRecipes = bot.recipesAll ? bot.recipesAll('planks') : bot.recipesFor('planks', null, 1)
    if (!plankRecipes || plankRecipes.length === 0) return false
    const recipe = plankRecipes[0]
    await bot.craft(recipe, logsToUse)
    return true
  } catch (e) {
    console.warn('[Crafting] craftPlanksFromLogs failed:', e && e.message)
    return false
  }
}

/**
 * Ensure some usable fuel exists in inventory (coal/charcoal/planks).
 * If none and logs exist, attempt to craft planks to use as fuel.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if fuel available
 */
export async function ensureFuel(bot) {
  try {
    const items = bot.inventory.items()
    const hasCoal = items.some(i => i.name && (i.name === 'coal' || i.name === 'charcoal'))
    const hasPlanks = items.some(i => i.name && i.name.includes('plank'))
    const hasDriedKelpBlock = items.some(i => i.name && i.name === 'dried_kelp_block')
    const hasDriedKelp = items.some(i => i.name && i.name === 'dried_kelp')
    const hasKelp = items.some(i => i.name && i.name === 'kelp')

    // Accept coal, planks, dried kelp (and dried kelp blocks) as fuel
    if (hasCoal || hasPlanks || hasDriedKelpBlock || hasDriedKelp) return true

    // If only raw kelp present, we can't directly use it as fuel, but if we have many kelp
    // we could try to smelt them into dried_kelp — that requires a furnace and fuel, so skip.

    // try to craft planks from logs as fallback
    const hasLogs = items.some(i => i.name && i.name.includes('log'))
    if (!hasLogs) return false

    const crafted = await craftPlanksFromLogs(bot, 1)
    if (crafted) return bot.inventory.items().some(i => i.name && i.name.includes('plank'))
    return false
  } catch (e) {
    console.warn('[Crafting] ensureFuel error:', e && e.message)
    return false
  }
}

/**
 * Check whether bot has an iron (or better) pickaxe.
 * @param {import('mineflayer').Bot} bot
 * @returns {boolean}
 */
export function hasIronPickaxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name && (i.name.includes('iron_pickaxe') || i.name.includes('diamond_pickaxe') || i.name.includes('netherite_pickaxe')))
}

/**
 * Check whether bot has a stone (or better) pickaxe.
 * @param {import('mineflayer').Bot} bot
 * @returns {boolean}
 */
export function hasStonePickaxe(bot) {
  const items = bot.inventory.items()
  return items.some(i => i.name && (i.name.includes('stone_pickaxe') || i.name.includes('iron_pickaxe') || i.name.includes('diamond_pickaxe') || i.name.includes('netherite_pickaxe')))
}

/**
 * Ensure a stone pickaxe is available (craft from cobblestone + sticks if possible).
 * Falls back to wooden pickaxe if stone not possible.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>}
 */
export async function ensureStonePickaxe(bot) {
  if (hasPickaxe(bot) && hasStonePickaxe(bot)) return true
  // If we have any pickaxe (wooden) but no stone, try to upgrade
  try {
    const items = bot.inventory.items()
    const hasCobble = items.some(i => i.name && (i.name === 'cobblestone' || i.name === 'stone'))
    const hasSticks = items.some(i => i.name && i.name === 'stick')
    if (!hasSticks) {
      // try craft sticks from planks
      const stickRec = bot.recipesAll ? bot.recipesAll('stick') : bot.recipesFor('stick', null, 1)
      if (stickRec && stickRec.length > 0) {
        try { await bot.craft(stickRec[0], 1) } catch (_) {}
      }
    }

    if (hasCobble) {
      const success = await tryCraft(bot, 'stone_pickaxe', 1)
      if (success) return true
    }
  } catch (e) {
    console.warn('[Crafting] ensureStonePickaxe failed:', e && e.message)
  }
  // fallback to wooden pickaxe
  return ensureWoodenPickaxe(bot)
}

/**
 * Ensure an iron pickaxe is available (craft from iron ingots + sticks if possible).
 * Falls back to stone pickaxe if iron not possible.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>}
 */
export async function ensureIronPickaxe(bot) {
  if (hasPickaxe(bot) && hasIronPickaxe(bot)) return true
  // Try to craft iron_pickaxe
  try {
    const items = bot.inventory.items()
    const hasIronIngots = items.some(i => i.name && i.name === 'iron_ingot')
    const hasSticks = items.some(i => i.name && i.name === 'stick')
    if (!hasSticks) {
      const stickRec = bot.recipesAll ? bot.recipesAll('stick') : bot.recipesFor('stick', null, 1)
      if (stickRec && stickRec.length > 0) {
        try { await bot.craft(stickRec[0], 1) } catch (_) {}
      }
    }

    if (hasIronIngots) {
      const success = await tryCraft(bot, 'iron_pickaxe', 1)
      if (success) return true
    }
  } catch (e) {
    console.warn('[Crafting] ensureIronPickaxe failed:', e && e.message)
  }
  // fallback to stone pickaxe
  return ensureStonePickaxe(bot)

}


export default { hasPickaxe, tryCraft, ensureWoodenPickaxe }
