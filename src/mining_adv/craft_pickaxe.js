// Advanced mining pickaxe crafting (robust like wood axe logic, isolated)
const { ensureCraftingTable } = require('../crafting-blocks.js')
const { ensureCraftingTableOpen, craftPlanksFromLogs, craftSticks } = require('../crafting-recipes.js')
const { ensureWoodenPickaxe, ensureStonePickaxe } = require('../crafting-tools.js')
const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg

function countItem(bot, nameFragment) {
  return bot.inventory.items().filter(i => i.name && i.name.includes(nameFragment)).reduce((s,it)=>s+it.count,0)
}

async function gatherLogs(bot, needed = 3, radius = 20) {
  const { createLeafDigMovements } = require('../movement.js')
  let attempts = 0
  while (countItem(bot,'log') < needed && attempts < 12) {
    attempts++
    const logBlock = bot.findBlock({ matching: b => b && b.name && b.name.includes('log'), maxDistance: radius, count:1 })
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
    } catch (e) { bot._isDigging = false }
  }
  return countItem(bot,'log') >= needed
}

async function ensurePickaxePrepared(bot, preferred = 'stone') {
  // Pause stuck detection
  const prevTask = bot.isDoingTask; bot.isDoingTask = false
  try {
    // Try existing pick first (skip broken tools with 0 durability)
    const existing = bot.inventory.items().find(i => i.name && i.name.includes('pickaxe') && (!i.nbt || i.nbt?.value?.Damage?.value !== i.nbt?.value?.RepairCost?.value))
    if (existing) { 
      console.log('[CraftPickaxe] Found existing pickaxe:', existing.name)
      await bot.equip(existing,'hand'); 
      return true 
    }

    // Gather logs for planks/sticks if needed
    if (countItem(bot,'log') < 3) {
      await gatherLogs(bot,3,24)
    }

    // Ensure crafting table FIRST (before any crafting)
    const hadTableBefore = !!bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
    const hasTable = await ensureCraftingTable(bot)
    if (!hasTable) { bot.chat('❌ Geen crafting table voor pickaxe'); return false }
    
    // ALWAYS open the table before crafting (even if it already existed)
    const opened = await ensureCraftingTableOpen(bot)
    if (!opened) { bot.chat('❌ Kan crafting table niet openen'); return false }

    // NOW craft materials (table is open, all crafting uses the table)
    // Make planks from logs (use up to 3)
    const logsToUse = Math.min(countItem(bot,'log'),3)
    if (logsToUse > 0) {
      bot.chat(`🪵 Planks craften (${logsToUse} logs)`)
      try { await craftPlanksFromLogs(bot, logsToUse) } catch(e){ bot.chat('⚠️ Plank craft mislukt') }
    }
    // Craft sticks if low (<4) - need extra for future stone pickaxe!
    if (countItem(bot,'stick') < 4 && countItem(bot,'planks') >= 2) {
      bot.chat('🔧 Sticks craften')
      try { await craftSticks(bot,2) } catch(e){ bot.chat('⚠️ Stick craft mislukt') }
    }

    // Try stone pickaxe if we have cobblestone
    const cobbleCount = countItem(bot,'cobblestone')
    let crafted = false
    if (preferred === 'stone' && cobbleCount >= 3 && countItem(bot,'stick') >= 2) {
      bot.chat('🔨 Stone pickaxe craft poging...')
      const ok = await ensureStonePickaxe(bot)
      crafted = ok
      if (!ok) bot.chat('⚠️ Stone pickaxe craft mislukt')
    }
    // Fallback / explicit wooden pickaxe sequence
    if (!crafted) {
      // If sticks missing, try crafting them now (requires planks)
      if (countItem(bot,'stick') < 4 && countItem(bot,'planks') >= 2) {
        bot.chat('🔧 Sticks craften voor wooden pickaxe')
        try { await craftSticks(bot,2) } catch(e){ bot.chat('⚠️ Stick craft mislukt') }
      }
      // If planks still insufficient, convert remaining logs
      if (countItem(bot,'planks') < 3 && countItem(bot,'log') > 0) {
        const moreLogs = Math.min(countItem(bot,'log'), 3 - countItem(bot,'planks'))
        if (moreLogs > 0) {
          bot.chat(`🪵 Extra planks craften (${moreLogs} logs)`) 
          try { await craftPlanksFromLogs(bot, moreLogs) } catch(e){ bot.chat('⚠️ Plank craft mislukt') }
        }
      }
      
      // Re-count AFTER all crafting attempts
      const finalPlanks = countItem(bot,'planks')
      const finalSticks = countItem(bot,'stick')
      
      if (finalPlanks >= 3 && finalSticks >= 2) {
        bot.chat('🔨 Wooden pickaxe craft poging...')
        const ok = await ensureWoodenPickaxe(bot)
        crafted = ok
        if (!ok) bot.chat('❌ Wooden pickaxe craft mislukt')
      } else {
        bot.chat(`❌ Onvoldoende materialen voor wooden pickaxe (planks=${finalPlanks}, sticks=${finalSticks})`)
      }
    }

    // Close window for cleanliness
    if (bot.currentWindow) { try { bot.closeWindow(bot.currentWindow) } catch(_){} }

    // Reclaim temporary table if we placed it
    const tableAfter = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
    if (!hadTableBefore && tableAfter) {
      try {
        bot._isDigging = true
        await bot.dig(tableAfter)
        bot._isDigging = false
        await new Promise(r=>setTimeout(r,500))
      } catch(e) { bot._isDigging = false }
    }

    // Equip
    const newPick = bot.inventory.items().find(i => i.name && i.name.includes('pickaxe'))
    if (newPick) { try { await bot.equip(newPick,'hand'); bot.chat('✅ Pickaxe klaar') } catch(e){ bot.chat('⚠️ Kon pickaxe niet equippen') } }

    return !!newPick
  } finally {
    bot.isDoingTask = prevTask
    bot._isDigging = false
  }
}

module.exports = { ensurePickaxePrepared }
