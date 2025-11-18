const { ensureCraftingTable } = require('../crafting-blocks.js')
const { ensureCraftingTableOpen } = require('../crafting-recipes.js')
const { craftPlanksFromLogs } = require('../crafting-recipes.js')

function pickaxeTier(name) {
  if (!name) return -1
  if (name.includes('wooden_pickaxe')) return 0
  if (name.includes('stone_pickaxe')) return 1
  if (name.includes('iron_pickaxe')) return 2
  if (name.includes('diamond_pickaxe')) return 3
  return -1
}
function requiredTierForBlock(blockName) {
  if (!blockName) return 0
  if (blockName.includes('stone') || blockName.includes('coal')) return 0
  if (blockName.includes('iron') || blockName.includes('copper')) return 1
  if (blockName.includes('gold') || blockName.includes('redstone') || blockName.includes('lapis')) return 2
  if (blockName.includes('diamond') || blockName.includes('emerald')) return 2 // allow iron
  return 0
}
function findBestPickaxe(bot, neededTier) {
  const picks = bot.inventory.items().filter(i => i.name && i.name.includes('pickaxe'))
  let best = null
  for (const p of picks) {
    const t = pickaxeTier(p.name)
    if (t >= neededTier) {
      if (!best || pickaxeTier(best.name) < t) best = p
    }
  }
  return best
}
async function ensurePickaxeFor(bot, blockName) {
  const req = requiredTierForBlock(blockName)
  const existing = findBestPickaxe(bot, req)
  if (existing) {
    try { await bot.equip(existing, 'hand') } catch (e) {}
    return true
  }
  // Craft wooden pickaxe baseline
  const planks = bot.inventory.items().filter(i => i.name && i.name.includes('planks'))
  const sticks = bot.inventory.items().filter(i => i.name === 'stick')
  // Make minimal planks if missing
  if (planks.reduce((s,it)=>s+it.count,0) < 3) {
    const log = bot.inventory.items().find(i => i.name && i.name.includes('log'))
    if (log) {
      await craftPlanksFromLogs(bot, 1)
    }
  }
  const hasTable = await ensureCraftingTable(bot)
  if (!hasTable) return false
  await ensureCraftingTableOpen(bot)
  try {
    const targetName = 'wooden_pickaxe'
    const itemDef = bot.registry.itemsByName[targetName]
    if (itemDef) {
      const tableBlock = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6 })
      const recipes = bot.recipesFor(itemDef.id, null, 1, tableBlock)
      if (recipes && recipes.length > 0) {
        await bot.craft(recipes[0], 1, tableBlock)
      }
    }
  } catch (e) {}
  const crafted = findBestPickaxe(bot, 0)
  if (crafted) {
    try { await bot.equip(crafted, 'hand') } catch (e) {}
    // optional: dig up table if we placed one (not implemented here)
    return true
  }
  return false
}
module.exports = { ensurePickaxeFor, pickaxeTier, requiredTierForBlock }
