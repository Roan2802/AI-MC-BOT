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
    console.log('[CraftPickaxe] Starting material crafting...')
    console.log('[CraftPickaxe] Initial: logs=', countItem(bot,'log'), 'planks=', countItem(bot,'planks'), 'sticks=', countItem(bot,'stick'))
    
    // Make planks from logs - need at least 5 planks total (3 for pickaxe + 2 for sticks)
    const logsToUse = Math.min(countItem(bot,'log'), 2) // 2 logs = 8 planks
    if (logsToUse > 0) {
      console.log(`[CraftPickaxe] Crafting planks from ${logsToUse} logs...`)
      for (let i = 0; i < logsToUse; i++) {
        try { 
          await craftPlanksFromLogs(bot, 1)
          console.log(`[CraftPickaxe] Crafted planks ${i+1}/${logsToUse}, now have ${countItem(bot,'planks')} planks`)
        } catch(e){ console.log('[CraftPickaxe] Plank craft error:', e.message) }
      }
    }
    
    console.log('[CraftPickaxe] After planks: planks=', countItem(bot,'planks'), 'sticks=', countItem(bot,'stick'))
    
    // Craft sticks if low (<2) - need 2 for pickaxe
    const sticksNeeded = countItem(bot,'stick') < 2
    const planksAvailable = countItem(bot,'planks') >= 2
    console.log(`[CraftPickaxe] Sticks check: need=${sticksNeeded}, have planks=${planksAvailable}`)
    
    if (sticksNeeded && planksAvailable) {
      console.log('[CraftPickaxe] Crafting 1x sticks (4 sticks from 2 planks)...')
      try { 
        await craftSticks(bot, 1)
        console.log(`[CraftPickaxe] Crafted sticks, now have ${countItem(bot,'stick')} sticks and ${countItem(bot,'planks')} planks`)
      } catch(e){ 
        console.log('[CraftPickaxe] Stick craft error:', e.message)
      }
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
      // Log message afhankelijk van of stone pickaxe echt geprobeerd is
      if (preferred === 'stone') {
        console.log('[CraftPickaxe] Stone pickaxe niet gelukt, probeer wooden pickaxe...')
      } else {
        console.log('[CraftPickaxe] Preparing wooden pickaxe (stone skip)')
      }
      
      // Check if we need more materials
      const currentPlanks = countItem(bot,'planks')
      const currentSticks = countItem(bot,'stick')
      const currentLogs = countItem(bot,'log')
      
      console.log(`[CraftPickaxe] Current materials: planks=${currentPlanks}, sticks=${currentSticks}, logs=${currentLogs}`)
      
      // If sticks missing, try crafting them now (requires planks)
      if (currentSticks < 2 && currentPlanks >= 2) {
        bot.chat('🔧 Sticks craften voor wooden pickaxe')
        try { await craftSticks(bot,1) } catch(e){ bot.chat('⚠️ Stick craft mislukt') }
      }
      
      // If planks still insufficient, convert remaining logs
      if (countItem(bot,'planks') < 3 && currentLogs > 0) {
        const moreLogs = Math.min(currentLogs, 1) // 1 log = 4 planks, should be enough
        if (moreLogs > 0) {
          bot.chat(`🪵 Extra planks craften (${moreLogs} logs)`) 
          try { await craftPlanksFromLogs(bot, moreLogs) } catch(e){ bot.chat('⚠️ Plank craft mislukt') }
        }
      }
      
      // Re-count AFTER all crafting attempts
      const finalPlanks = countItem(bot,'planks')
      const finalSticks = countItem(bot,'stick')
      
      console.log(`[CraftPickaxe] Final materials after extra crafting: planks=${finalPlanks}, sticks=${finalSticks}`)
      console.log(`[CraftPickaxe] Wooden pickaxe needs: 3 planks + 2 sticks`)
      
      if (finalPlanks >= 3 && finalSticks >= 2) {
        bot.chat('🔨 Wooden pickaxe craft poging...')
        
        // Direct craft instead of using external function
        try {
          const craftingTable = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
          if (!craftingTable) {
            bot.chat('❌ Crafting table niet gevonden')
            return false
          }
          
          // Ensure window is open
          if (!bot.currentWindow || bot.currentWindow.type !== 'minecraft:crafting') {
            console.log('[CraftPickaxe] Opening crafting table for wooden pickaxe...')
            await bot.openBlock(craftingTable)
            await new Promise(r => setTimeout(r, 500)) // Longer wait for window to open
          }
          
          const pickaxeItem = bot.registry.itemsByName.wooden_pickaxe
          if (!pickaxeItem) {
            console.log('[CraftPickaxe] wooden_pickaxe not in registry')
            bot.chat('❌ wooden_pickaxe niet in registry')
            return false
          }
          
          console.log('[CraftPickaxe] Looking for recipes, window type:', bot.currentWindow?.type)
          
          // Try multiple recipe lookup methods
          let recipes = null
          
          // Method 1: Use current window
          if (bot.currentWindow) {
            recipes = bot.recipesFor(pickaxeItem.id, null, 1, bot.currentWindow)
            console.log('[CraftPickaxe] Window recipes:', recipes?.length || 0)
          }
          
          // Method 2: Use crafting table block
          if (!recipes || recipes.length === 0) {
            recipes = bot.recipesFor(pickaxeItem.id, null, 1, craftingTable)
            console.log('[CraftPickaxe] Table recipes:', recipes?.length || 0)
          }
          
          // Method 3: Get all recipes and filter
          if (!recipes || recipes.length === 0) {
            try {
              const allRecipes = bot.recipesFor(pickaxeItem.id)
              recipes = allRecipes
              console.log('[CraftPickaxe] All recipes:', recipes?.length || 0)
            } catch(e) {
              console.log('[CraftPickaxe] recipesFor all error:', e.message)
            }
          }
          
          if (!recipes || recipes.length === 0) {
            console.log('[CraftPickaxe] No recipes found for wooden_pickaxe')
            bot.chat('❌ Geen recept voor wooden pickaxe')
            
            // Debug: show what's in inventory
            const planksInv = bot.inventory.items().filter(i => i.name && i.name.includes('planks'))
            const sticksInv = bot.inventory.items().filter(i => i.name === 'stick')
            console.log('[CraftPickaxe] Planks:', planksInv.map(i => `${i.name}:${i.count}`).join(', '))
            console.log('[CraftPickaxe] Sticks:', sticksInv.map(i => `${i.name}:${i.count}`).join(', '))
            
            return false
          }
          
          console.log('[CraftPickaxe] Crafting wooden_pickaxe with recipe...')
          await bot.craft(recipes[0], 1, craftingTable)
          console.log('[CraftPickaxe] Crafted wooden_pickaxe')
          bot.chat('✅ Wooden pickaxe gemaakt!')
          crafted = true
        } catch(e) {
          console.error('[CraftPickaxe] Direct craft error:', e.message)
          bot.chat('❌ Wooden pickaxe craft error: ' + e.message)
        }
      } else {
        bot.chat(`❌ Onvoldoende materialen voor wooden pickaxe (planks=${finalPlanks}, sticks=${finalSticks})`)
      }
    }

    // Close window for cleanliness
    if (bot.currentWindow) { try { bot.closeWindow(bot.currentWindow) } catch(_){} }

    // Reclaim temporary table if we placed it
    // Safely reclaim temporary crafting table only if it still exists
    try {
      const tableAfter = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
      if (!hadTableBefore && tableAfter) {
        if (tableAfter.diggable) {
          bot._isDigging = true
          await bot.dig(tableAfter)
          bot._isDigging = false
          await new Promise(r=>setTimeout(r,500))
        }
      }
    } catch(e) {
      bot._isDigging = false
      console.log('[CraftPickaxe] Veilig genegeerde table reclaim error:', e.message)
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
