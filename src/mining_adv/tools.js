// Mining Advanced - tool management wrappers (isolated from wood system)
const { ensureWoodenPickaxe, ensureStonePickaxe, ensureIronPickaxe } = require('../crafting-tools.js')

async function ensureMiningPick(bot, preferred = 'stone') {
  // Try iron if preferred iron; fallback stone then wooden
  const inv = bot.inventory.items()
  const has = name => inv.some(i => i.name === name)
  if (preferred === 'iron' && has('iron_pickaxe')) return true
  if (preferred === 'stone' && has('stone_pickaxe')) return true
  if (has('diamond_pickaxe')) return true // best available

  // Craft sequence based on preferred
  if (preferred === 'iron') {
    if (await ensureIronPickaxe(bot)) return true
  }
  if (preferred !== 'wood') {
    if (await ensureStonePickaxe(bot)) return true
  }
  return await ensureWoodenPickaxe(bot)
}

module.exports = { ensureMiningPick }
