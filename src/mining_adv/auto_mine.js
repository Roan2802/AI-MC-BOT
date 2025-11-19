// Auto mining loop: progressive pickaxe upgrade (wood -> stone -> iron) and ore collection until inventory full.
const { ensurePickaxePrepared } = require('./craft_pickaxe.js')
const { ensureIronPickaxe, ensureStonePickaxe } = require('../crafting-tools.js')
const { ensureCraftingTable } = require('../crafting-blocks.js')
const { ensureCraftingTableOpen } = require('../crafting-recipes.js')
const { smeltOres } = require('../smelting.js')
const { staircaseMine } = require('./strategy_staircase.js')
const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg
const { mineResource, findConnectedOres } = require('../mining.js')

function count(bot, fragment) {
  return bot.inventory.items().filter(i => i.name && i.name.includes(fragment)).reduce((s,it)=>s+it.count,0)
}
function hasItem(bot,name){ return bot.inventory.items().some(i=>i.name===name) }
function invFull(bot){ return bot.inventory.emptySlotCount() === 0 }

async function craftFurnaceIfNeeded(bot) {
  // If furnace block nearby or in inventory already, skip crafting.
  const existingBlock = bot.findBlock({ matching: b => b && (b.name === 'furnace' || b.name === 'blast_furnace'), maxDistance: 8, count: 1 })
  if (existingBlock) {
    console.log('[Furnace] Found existing furnace nearby')
    return existingBlock
  }
  
  const furnaceInv = bot.inventory.items().find(i=>i.name==='furnace')
  if (furnaceInv) {
    console.log('[Furnace] Have furnace in inventory, placing it...')
    // Pause stuck detector tijdens placement
    const wasInTask = bot._doingTask
    bot._doingTask = true
    bot._placingFurnace = true
    
    try {
      const result = await placeFurnaceFromInventory(bot, furnaceInv)
      bot._doingTask = wasInTask
      bot._placingFurnace = false
      if (result) return result
    } catch(e) {
      console.log('[Furnace] Placement error:', e.message)
      bot._doingTask = wasInTask
      bot._placingFurnace = false
    }
  }
  
  // Need 8 cobblestone to craft
  const cobbleCount = count(bot,'cobblestone')
  if (cobbleCount < 8) {
    bot.chat(`❌ Niet genoeg cobblestone voor furnace (${cobbleCount}/8)`)
    return null
  }
  
  bot.chat(`🔨 Crafting furnace (${cobbleCount} cobblestone)...`)
  
  const tableOk = await ensureCraftingTable(bot)
  if (!tableOk) {
    bot.chat('❌ Kan crafting table niet maken')
    return null
  }
  
  const opened = await ensureCraftingTableOpen(bot)
  if (!opened) {
    bot.chat('❌ Kan crafting table niet openen')
    return null
  }
  
  try {
    const furnaceItem = bot.registry.itemsByName.furnace
    if (!furnaceItem) return null
    const table = bot.findBlock({ matching: b=>b && b.name==='crafting_table', maxDistance:6, count:1 })
    const recipes = bot.recipesFor(furnaceItem.id, null, 1, table)
    if (recipes && recipes.length > 0) {
      await bot.craft(recipes[0], 1, table)
      bot.chat('✅ Furnace gecraft')
    }
  } catch(e){ 
    console.log('[Furnace] Craft error:', e.message)
    bot.chat('❌ Furnace craft error')
  }
  
  // Close table
  if (bot.currentWindow) { 
    try { bot.closeWindow(bot.currentWindow) } catch(_){} 
  }
  
  // Furnace plaats-logica opgesplitst
  const newFurnaceInv = bot.inventory.items().find(i=>i.name==='furnace')
  if (newFurnaceInv) {
    bot._doingTask = true
    bot._placingFurnace = true
    
    try {
      const result = await placeFurnaceFromInventory(bot, newFurnaceInv)
      bot._doingTask = false
      bot._placingFurnace = false
      return result
    } catch(e) {
      bot._doingTask = false
      bot._placingFurnace = false
      bot.chat('❌ Kan geen furnace plaatsen')
      return null
    }
  }
  return bot.findBlock({ matching: b => b && (b.name === 'furnace' || b.name === 'blast_furnace'), maxDistance: 6, count:1 })
}

// Plaats furnace vanuit inventory op meerdere plekken
async function placeFurnaceFromInventory(bot, furnaceItem) {
  await bot.equip(furnaceItem, 'hand')
  await new Promise(r => setTimeout(r, 300))
  
  const offsets = [
    [0,-1,0], [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [1,0,1], [-1,0,-1], [1,0,-1], [-1,0,1]
  ]
  
  for (const [dx,dy,dz] of offsets) {
    const pos = bot.entity.position.offset(dx,dy,dz).floored()
    if (await tryPlaceFurnace(bot, pos, furnaceItem)) {
      return bot.findBlock({ matching: b => b && (b.name === 'furnace' || b.name === 'blast_furnace'), maxDistance: 6, count:1 })
    }
  }
  
  bot.chat('❌ Kan geen furnace plaatsen, alle plekken geblokkeerd')
  return null
}

// Zoek en maak ruimte, plaats furnace (zonder event timeouts)
async function tryPlaceFurnace(bot, pos, furnaceItem) {
  const targetPos = pos.offset(0,1,0).floored()
  let block = bot.blockAt(targetPos)
  
  // Als plek bezet is, dig eerst
  if (block && block.name !== 'air') {
    if (!block.diggable) return false
    
    console.log(`[Furnace] Clearing ${block.name} at ${targetPos.x},${targetPos.y},${targetPos.z}`)
    const pickaxe = bot.inventory.items().find(i => i.name && i.name.includes('pickaxe'))
    if (pickaxe) {
      await bot.equip(pickaxe, 'hand')
      await new Promise(r => setTimeout(r, 150))
    }
    
    try {
      bot._isDigging = true
      await bot.dig(block, true) // forceLook = true
      bot._isDigging = false
      await new Promise(r => setTimeout(r, 250))
      
      // Check direct of blok weg is (geen event wachten)
      block = bot.blockAt(targetPos)
      if (!block || block.name !== 'air') {
        console.log(`[Furnace] Block still there after dig: ${block?.name}`)
        return false
      }
    } catch(e) {
      bot._isDigging = false
      console.log(`[Furnace] Dig failed at ${targetPos.x},${targetPos.y},${targetPos.z}:`, e.message)
      return false
    }
  }
  
  // Probeer te plaatsen
  const ground = bot.blockAt(pos)
  if (!ground || ground.name === 'air') return false
  
  try {
    await bot.equip(furnaceItem, 'hand')
    await new Promise(r => setTimeout(r, 150))
    await bot.placeBlock(ground, {x:0, y:1, z:0})
    await new Promise(r => setTimeout(r, 250))
    
    // Check of furnace er staat (directe check)
    const placedBlock = bot.blockAt(targetPos)
    if (placedBlock && (placedBlock.name === 'furnace' || placedBlock.name === 'blast_furnace')) {
      bot.chat('🔥 Furnace geplaatst')
      console.log(`[Furnace] Successfully placed at ${targetPos.x},${targetPos.y},${targetPos.z}`)
      return true
    } else {
      console.log(`[Furnace] Place didn't work, block is: ${placedBlock?.name}`)
      return false
    }
  } catch(e) {
    console.log(`[Furnace] Place failed at ${targetPos.x},${targetPos.y},${targetPos.z}:`, e.message)
    return false
  }
}

// Smelt 3 raw iron to iron ingots and craft iron pickaxe
async function smeltAndCraftIronPickaxe(bot, furnaceBlock) {
  if (!furnaceBlock) {
    bot.chat('❌ Geen furnace gevonden')
    return false
  }

  // Pause stuck detector during smelting and crafting
  const wasInTask = bot._doingTask
  bot._doingTask = true
  bot._placingFurnace = true

  try {
    // Check if we have 3 raw iron
    const rawIronCount = count(bot, 'raw_iron')
    if (rawIronCount < 3) {
      bot.chat(`❌ Niet genoeg raw iron (${rawIronCount}/3)`)
      bot._doingTask = wasInTask
      bot._placingFurnace = false
      return false
    }

    // Check for fuel (planks or logs)
    const planksCount = count(bot, 'planks')
    const logCount = count(bot, 'log')
    if (planksCount < 3 && logCount < 1) {
      bot.chat('❌ Geen fuel (planks of logs)')
      bot._doingTask = wasInTask
      bot._placingFurnace = false
      return false
    }

    bot.chat('🔥 Smelting 3 raw iron...')
    console.log('[IronPickaxe] Opening furnace for smelting')

    let furnace
    try {
      furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock) : bot.openContainer(furnaceBlock))
    } catch (e) {
      console.log('[IronPickaxe] Failed to open furnace:', e.message)
      bot.chat('❌ Kan furnace niet openen')
      bot._doingTask = wasInTask
      bot._placingFurnace = false
      return false
    }

    // Add fuel (3 planks onderaan - evenveel als raw iron)
    const planks = bot.inventory.items().find(i => i.name && i.name.includes('planks'))
    const logs = bot.inventory.items().find(i => i.name && i.name.includes('log'))
    
    let fuelAmount = 3 // Same as raw iron amount
    let fuel = null
    
    if (planks && planks.count >= 3) {
      fuel = planks
      fuelAmount = 3
    } else if (logs && logs.count >= 3) {
      fuel = logs
      fuelAmount = 3
    } else if (planks) {
      fuel = planks
      fuelAmount = planks.count
    } else if (logs) {
      fuel = logs
      fuelAmount = logs.count
    }
    
    if (fuel) {
      console.log(`[IronPickaxe] Adding ${fuelAmount} ${fuel.name} as fuel`)
      await furnace.putFuel(fuel.type, null, fuelAmount)
      await new Promise(r => setTimeout(r, 300))
    } else {
      console.log('[IronPickaxe] No fuel available!')
    }

    // Add 3 raw iron bovenin
    const rawIron = bot.inventory.items().find(i => i.name === 'raw_iron')
    if (rawIron) {
      console.log('[IronPickaxe] Adding 3 raw iron to furnace')
      await furnace.putInput(rawIron.type, null, 3)
      await new Promise(r => setTimeout(r, 300))
    }

    // Wait for 3 iron ingots
    bot.chat('⏳ Wachten op iron ingots...')
    let collected = 0
    const start = Date.now()
    const TIMEOUT = 60000 // 1 minute
    
    while (Date.now() - start < TIMEOUT && collected < 3) {
      await new Promise(r => setTimeout(r, 2000))
      
      try {
        const output = furnace.outputItem()
        if (output && output.count > 0) {
          console.log(`[IronPickaxe] Found ${output.count} iron ingots in output`)
          await furnace.takeOutput()
          collected += output.count
          console.log(`[IronPickaxe] Collected ${collected}/3 iron ingots`)
        }
      } catch (e) {
        console.log('[IronPickaxe] Output check error:', e.message)
      }
      
      // Check if still smelting
      const input = furnace.inputItem()
      if (!input || input.count === 0) {
        // Wait a bit more for last item
        await new Promise(r => setTimeout(r, 3000))
        try {
          const output = furnace.outputItem()
          if (output && output.count > 0) {
            await furnace.takeOutput()
            collected += output.count
          }
        } catch (_) {}
        break
      }
    }

    try { furnace.close() } catch (_) {}

    if (collected < 3) {
      bot.chat(`❌ Niet genoeg iron ingots (${collected}/3)`)
      bot._doingTask = wasInTask
      bot._placingFurnace = false
      return false
    }

    bot.chat(`✅ ${collected} iron ingots verzameld`)
    
    // Now craft iron pickaxe
    const result = await craftIronPickaxeFromIngots(bot)
    
    // Re-enable stuck detector
    bot._doingTask = wasInTask
    bot._placingFurnace = false
    
    return result

  } catch (e) {
    console.log('[IronPickaxe] Smelting error:', e.message)
    try { furnace.close() } catch (_) {}
    bot.chat('❌ Smelting fout')
    bot._doingTask = wasInTask
    bot._placingFurnace = false
    return false
  }
}

// Craft iron pickaxe from 3 iron ingots + 2 sticks
async function craftIronPickaxeFromIngots(bot) {
  const ironCount = count(bot, 'iron_ingot')
  let stickCount = count(bot, 'stick')

  if (ironCount < 3) {
    bot.chat(`❌ Niet genoeg iron ingots (${ironCount}/3)`)
    return false
  }

  // Auto-craft sticks if missing
  if (stickCount < 2) {
    const planksCount = count(bot, 'planks')
    const logCount = count(bot, 'log')
    
    if (planksCount >= 2) {
      // Craft sticks from planks
      bot.chat(`🔨 Crafting sticks (${stickCount}/2)...`)
      try {
        const stickItem = bot.registry.itemsByName.stick
        if (stickItem) {
          const recipes = bot.recipesAll(stickItem.id, null, null)
          if (recipes && recipes.length > 0) {
            await bot.craft(recipes[0], 1, null)
            stickCount = count(bot, 'stick')
            bot.chat(`✅ Sticks gecraft (${stickCount})`)
          }
        }
      } catch (e) {
        console.log('[IronPickaxe] Stick crafting error:', e.message)
      }
    } else if (logCount >= 1) {
      // Craft planks from logs, then sticks
      bot.chat('🪵 Crafting planks voor sticks...')
      try {
        const logItem = bot.inventory.items().find(i => i.name && i.name.includes('log'))
        if (logItem) {
          const plankName = logItem.name.replace('_log', '_planks')
          const plankItem = bot.registry.itemsByName[plankName]
          if (plankItem) {
            const recipes = bot.recipesAll(plankItem.id, null, null)
            if (recipes && recipes.length > 0) {
              await bot.craft(recipes[0], 1, null)
              bot.chat('✅ Planks gecraft')
            }
          }
        }
        
        // Now craft sticks
        const stickItem = bot.registry.itemsByName.stick
        if (stickItem) {
          const recipes = bot.recipesAll(stickItem.id, null, null)
          if (recipes && recipes.length > 0) {
            await bot.craft(recipes[0], 1, null)
            stickCount = count(bot, 'stick')
            bot.chat(`✅ Sticks gecraft (${stickCount})`)
          }
        }
      } catch (e) {
        console.log('[IronPickaxe] Plank/stick crafting error:', e.message)
      }
    }
    
    // Check again after auto-craft
    stickCount = count(bot, 'stick')
    if (stickCount < 2) {
      bot.chat(`❌ Nog steeds niet genoeg sticks (${stickCount}/2)`)
      return false
    }
  }

  bot.chat('🔨 Crafting iron pickaxe...')
  
  // Find crafting table
  const table = bot.findBlock({ matching: b => b && b.name === 'crafting_table', maxDistance: 6, count: 1 })
  if (!table) {
    bot.chat('❌ Geen crafting table gevonden')
    return false
  }

  try {
    await bot.pathfinder.goto(new goals.GoalNear(table.position.x, table.position.y, table.position.z, 3))
    await new Promise(r => setTimeout(r, 200))
  } catch (_) {}

  try {
    const craftingTable = await bot.openBlock(table)
    await new Promise(r => setTimeout(r, 300))

    const ironPickaxeItem = bot.registry.itemsByName.iron_pickaxe
    if (!ironPickaxeItem) {
      bot.chat('❌ Iron pickaxe item niet gevonden')
      try { bot.closeWindow(bot.currentWindow) } catch (_) {}
      return false
    }

    const recipes = bot.recipesFor(ironPickaxeItem.id, null, 1, table)
    if (!recipes || recipes.length === 0) {
      bot.chat('❌ Geen iron pickaxe recipe')
      try { bot.closeWindow(bot.currentWindow) } catch (_) {}
      return false
    }

    await bot.craft(recipes[0], 1, table)
    bot.chat('✅ Iron pickaxe gecraft!')
    console.log('[IronPickaxe] Successfully crafted iron pickaxe')

    try { bot.closeWindow(bot.currentWindow) } catch (_) {}
    return true

  } catch (e) {
    console.log('[IronPickaxe] Crafting error:', e.message)
    bot.chat('❌ Craft fout: ' + e.message)
    try { bot.closeWindow(bot.currentWindow) } catch (_) {}
    return false
  }
}

function pickTier(bot){
  // Toon alle item-namen in inventory
  const allItems = bot.inventory.items().map(i => i.name).join(', ')
  console.log(`[pickTier][DEBUG] Inventory items: ${allItems}`)
  // Check for working pickaxes (not broken)
  const picks = bot.inventory.items().filter(i => i.name && i.name.includes('pickaxe'))
  let found = 'none'
  for (const pick of picks) {
    console.log(`[pickTier][DEBUG] name=${pick.name}`)
    if (pick.name && pick.name.includes('iron') && pick.name.includes('pickaxe')) {
      console.log('[pickTier][DEBUG] -> iron tier (substring match)')
      return 'iron'
    }
    if (pick.name && pick.name.includes('stone') && pick.name.includes('pickaxe')) {
      console.log('[pickTier][DEBUG] -> stone tier (substring match)')
      found = 'stone'
    }
    if (pick.name && pick.name.includes('wooden') && pick.name.includes('pickaxe')) {
      console.log('[pickTier][DEBUG] -> wood tier (substring match)')
      if (found === 'none') found = 'wood'
    }
  }
  console.log(`[pickTier][DEBUG] -> final tier: ${found}`)
  return found
}

async function acquireInitialPick(bot){
  const tier = pickTier(bot)
  if (tier !== 'none') return true
  // Start with wooden pickaxe
  return await ensurePickaxePrepared(bot,'wood')
}

async function upgradeToStone(bot){
  const tier = pickTier(bot)
  console.log('[AutoMine] Current pickaxe tier:', tier)
  
  if (tier === 'stone' || tier === 'iron') {
    console.log('[AutoMine] Already have stone/iron pickaxe, skipping upgrade')
    return true
  }
  
  // Need 3 cobblestone for stone pickaxe
  const cobbleCount = count(bot,'cobblestone')
  if (cobbleCount < 3) {
    bot.chat(`⬇️ Mining cobblestone (${cobbleCount}/3)...`)
    // Staircase down until we have 3 cobblestone
    try {
      bot._stairMiningStop = false
      await staircaseMine(bot, { 
        targetY: 10, 
        maxSteps: 120, 
        pickPreference: 'wood',
        // Verzamel genoeg cobblestone voor zowel stone pick (3) als toekomstige furnace (8)
        targetCobble: 11 
      })
    } catch(e){ console.log('[AutoMine] Staircase error:', e.message) }
    
    // Check if we got enough
    if (count(bot,'cobblestone') < 3) {
      bot.chat(`❌ Niet genoeg cobblestone (${count(bot,'cobblestone')}/3)`)
      return false
    }
  }
  
  // Craft stone pickaxe (place table from inventory if needed, then cleanup)
  bot.chat(`🔨 Crafting stone pickaxe (${count(bot,'cobblestone')} cobblestone)...`)
  
  // Check if table exists nearby
  let tableExists = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
  
  // If no table nearby, check inventory and place it
  if (!tableExists) {
    const tableInInv = bot.inventory.items().find(i => i.name === 'crafting_table')
    if (tableInInv) {
      bot.chat('📦 Crafting table plaatsen uit inventory')
      // Place the table from inventory
      const { placeCraftingTable } = require('../crafting-blocks.js')
      const placed = await placeCraftingTable(bot)
      if (!placed) {
        bot.chat('❌ Kan crafting table niet plaatsen')
        return false
      }
      tableExists = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
    } else {
      // No table in inventory, need to craft a new one
      bot.chat('🪵 Geen crafting table, nieuwe maken...')
      const tableOk = await ensureCraftingTable(bot)
      if (!tableOk) {
        bot.chat('❌ Kan geen crafting table maken')
        return false
      }
      tableExists = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
    }
  }
  
  if (!tableExists) {
    bot.chat('❌ Geen crafting table beschikbaar')
    return false
  }
  
  // Open the table before crafting
  try {
    await bot.openBlock(tableExists)
    await new Promise(r => setTimeout(r, 300))
  } catch(e) {
    bot.chat('❌ Kan crafting table niet openen')
    return false
  }
  
  const crafted = await ensureStonePickaxe(bot)
  
  // Close window
  if (bot.currentWindow) {
    try { bot.closeWindow(bot.currentWindow) } catch(_){}
  }
  
  if (crafted) {
    bot.chat('✅ Stone pickaxe gemaakt!')
    // Cleanup table (re-find to avoid using stale reference)
    try {
      const tableToRemove = bot.findBlock({ matching: b => b && b.name==='crafting_table', maxDistance:6, count:1 })
      if (tableToRemove && tableToRemove.diggable) {
        bot._isDigging = true
        await bot.dig(tableToRemove)
        bot._isDigging = false
        bot.chat('🗑️ Crafting table opgeruimd')
        await new Promise(r=>setTimeout(r,500))
      } else {
        bot.chat('ℹ️ Geen crafting table om op te ruimen (waarschijnlijk al weg)')
      }
    } catch(e) { 
      bot._isDigging = false 
      console.log('[AutoMine] Crafting table remove error (veilig genegeerd):', e.message)
    }

    // Ensure we are holding the new stone pickaxe (choose best available)
    try {
      const bestPick = ['iron_pickaxe','stone_pickaxe','wooden_pickaxe']
        .map(name => bot.inventory.items().find(i => i.name === name))
        .filter(Boolean)[0]
      if (bestPick) {
        await bot.equip(bestPick,'hand')
        bot.chat(`🖐️ ${bestPick.name} in hand voor verder minen`)
      }
    } catch(e){ console.log('[AutoMine] Equip stone pickaxe error:', e.message) }
  }
  return crafted
}

async function upgradeToIron(bot){
  if (pickTier(bot) === 'iron') return true
  
  // Need 3 iron ingots; if not present but have raw/ore iron -> smelt.
  const ingots = count(bot,'iron_ingot')
  if (ingots >= 3) {
    // We have ingots, just craft the pickaxe
    return await craftIronPickaxeFromIngots(bot)
  }
  
  // Check if we have enough raw iron/ore to smelt
  const ironOreCount = bot.inventory.items().filter(i => i.name === 'iron_ore' || i.name === 'raw_iron' || i.name === 'deepslate_iron_ore').reduce((s,it)=>s+it.count,0)
  if (ironOreCount < 3) {
    return false // Not enough material yet
  }

  // Zorg dat we genoeg cobblestone hebben voor furnace craft (8 nodig)
  const cobbleCountBefore = count(bot,'cobblestone')
  if (cobbleCountBefore < 8) {
    bot.chat(`⬇️ Extra cobblestone minen voor furnace (${cobbleCountBefore}/8)`)
    try {
      bot._stairMiningStop = false
      await staircaseMine(bot, {
        targetY: Math.max(5, Math.floor(bot.entity.position.y) - 4),
        maxSteps: 60,
        pickPreference: 'stone',
        targetCobble: 8
      })
    } catch (e) { console.log('[AutoMine] Extra cobble mining error:', e.message) }
  }
  
  // Ensure furnace exists
  const furnace = await craftFurnaceIfNeeded(bot)
  if (!furnace) {
    bot.chat('❌ Kan geen furnace maken (niet genoeg cobblestone)')
    return false
  }
  
  // Smelt 3 raw iron and craft iron pickaxe
  return await smeltAndCraftIronPickaxe(bot, furnace)
}

// Mine all adjacent ore blocks of the same type (vein mining)
async function mineOreVein(bot, startBlock, oreName) {
  const mined = new Set()
  const toMine = [startBlock]
  let count = 0
  
  while (toMine.length > 0 && count < 20) { // Max 20 blocks per vein
    const block = toMine.shift()
    const key = `${block.position.x},${block.position.y},${block.position.z}`
    if (mined.has(key)) continue
    mined.add(key)
    
    // Mine this block
    try {
      const dist = bot.entity.position.distanceTo(block.position)
      if (dist > 4.5) {
        // Pathfind closer
        try {
          const movements = new Movements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 3)
          await bot.pathfinder.goto(goal)
        } catch(e) { console.log('[VeinMine] Pathfind error:', e.message) }
      }
      
      // Save drop position BEFORE digging
      const dropPos = block.position.clone()
      
      bot._isDigging = true
      await bot.dig(block)
      bot._isDigging = false
      count++
      
      // Immediately wait for initial drop
      await new Promise(r => setTimeout(r, 200))
      
      // Move ONTO the exact position where the ore was (where items drop)
      try {
        // Stop any pathfinding first
        bot.pathfinder.setGoal(null)
        await new Promise(r => setTimeout(r, 100))
        
        // Move to exact block position
        const movements = new Movements(bot)
        movements.canDig = false // Don't dig while collecting
        bot.pathfinder.setMovements(movements)
        
        // Go to the exact block where ore was
        const goal = new goals.GoalBlock(dropPos.x, dropPos.y, dropPos.z)
        await bot.pathfinder.goto(goal)
        
        console.log(`[VeinMine] Moved to drop position ${dropPos.x},${dropPos.y},${dropPos.z}`)
      } catch(e) { 
        console.log('[VeinMine] Move to drop error:', e.message)
        // Try at least getting close
        try {
          const movements = new Movements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalNear(dropPos.x, dropPos.y, dropPos.z, 1)
          await bot.pathfinder.goto(goal)
        } catch(e2) { /* ignore */ }
      }
      
      // Wait for pickup after moving to position
      await new Promise(r => setTimeout(r, 500))
      
    } catch(e) { 
      bot._isDigging = false
      console.log('[VeinMine] Dig error:', e.message) 
    }
    
    // Find adjacent ore blocks (6 directions)
    const offsets = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]
    for (const [dx,dy,dz] of offsets) {
      const pos = block.position.offset(dx, dy, dz)
      const adjBlock = bot.blockAt(pos)
      if (adjBlock && adjBlock.name === oreName) {
        const adjKey = `${pos.x},${pos.y},${pos.z}`
        if (!mined.has(adjKey)) {
          toMine.push(adjBlock)
        }
      }
    }
  }
  
  // Final pickup wait and scan for nearby items
  await new Promise(r => setTimeout(r, 1000))
  
  // Collect any remaining item entities nearby
  const nearbyItems = Object.values(bot.entities).filter(e => {
    try {
      if (!e || !e.position) return false
      if (e.position.distanceTo(bot.entity.position) > 8) return false
      return e.displayName === 'Item' || e.name === 'item'
    } catch(_) { return false }
  })
  
  for (const item of nearbyItems) {
    try {
      const movements = new Movements(bot)
      bot.pathfinder.setMovements(movements)
      const goal = new goals.GoalNear(item.position.x, item.position.y, item.position.z, 1)
      await bot.pathfinder.goto(goal)
      await new Promise(r => setTimeout(r, 300))
    } catch(_) { /* item picked up or despawned */ }
  }
  
  return count
}

// Phase: descend to y=16, then strip mine or mine any iron veins found
async function gatherIronPhase(bot) {
  const getIronCount = () => bot.inventory.items().filter(i => i.name === 'iron_ore' || i.name === 'raw_iron' || i.name === 'deepslate_iron_ore').reduce((s,it)=>s+it.count,0)
  
  if (getIronCount() >= 3) return true
  
  // Ensure task flag is set
  bot.isDoingTask = true
  
  bot.chat('🔍 Mining naar y=16 voor iron ore')
  
  // Step 1: Staircase down to y=16
  const currentY = Math.floor(bot.entity.position.y)
  if (currentY > 16) {
    bot.chat(`⬇️ Staircase mining van y=${currentY} naar y=16`)
    try {
      bot._stairMiningStop = false
      await staircaseMine(bot, { 
        targetY: 16, 
        maxSteps: 200, 
        pickPreference: 'stone',
        targetCobble: 0 
      })
    } catch(e){ console.log('[AutoMine] Staircase to y=16 error:', e.message) }
  }
  
  // Step 2: Check for iron during descent
  let ironCount = getIronCount()
  if (ironCount >= 3) {
    bot.chat(`✅ ${ironCount} iron ore gevonden tijdens descent`)
    return true
  }
  
  // Step 3: Strip mine straight ahead or mine any visible iron
  bot.chat('⛏️ Strip mining voor iron ore...')
  const stripMineLength = 30
  let mined = 0
  
  while (ironCount < 3 && mined < stripMineLength) {
    // Scan for nearby iron first
    const ironOre = bot.findBlock({ 
      matching: b => b && (b.name === 'iron_ore' || b.name === 'deepslate_iron_ore'),
      maxDistance: 16,
      count: 1
    })
    
    if (ironOre) {
      bot.chat(`⚡ Iron ore gevonden! Mining vein...`)
      const veinSize = await mineOreVein(bot, ironOre, ironOre.name)
      bot.chat(`✅ ${veinSize} iron ore blokken gemined`)
      ironCount = getIronCount()
      if (ironCount >= 3) break
    }
    
    // Continue strip mining straight ahead
    const forward = bot.entity.position.offset(0, 0, 1) // Mine forward
    const blockAhead = bot.blockAt(forward)
    
    if (blockAhead && blockAhead.name !== 'air') {
      try {
        bot._isDigging = true
        await bot.dig(blockAhead)
        bot._isDigging = false
        mined++
        await new Promise(r => setTimeout(r, 100))
        
        // Move forward
        try {
          const movements = new Movements(bot)
          bot.pathfinder.setMovements(movements)
          const goal = new goals.GoalBlock(forward.x, forward.y, forward.z)
          await bot.pathfinder.goto(goal)
        } catch(e) { /* ignore movement errors */ }
      } catch(e) { 
        bot._isDigging = false
        console.log('[StripMine] Dig error:', e.message)
        break 
      }
    } else {
      // Already air, just move
      try {
        const movements = new Movements(bot)
        bot.pathfinder.setMovements(movements)
        const goal = new goals.GoalBlock(forward.x, forward.y, forward.z)
        await bot.pathfinder.goto(goal)
        mined++
      } catch(e) { break }
    }
    
    ironCount = getIronCount()
  }
  
  ironCount = getIronCount()
  if (ironCount >= 3) {
    bot.chat(`✅ ${ironCount} iron ore verzameld`)
    return true
  }
  
  bot.chat(`⚠️ Iron gathering gestopt (y=${Math.floor(bot.entity.position.y)}, iron=${ironCount})`)
  return ironCount >= 3
}

async function gatherNearestOre(bot, radius){
  const tier = pickTier(bot)
  
  // With iron pickaxe: only mine valuable ores (iron, coal, redstone, lapis, diamonds)
  if (tier === 'iron') {
    const valuableOres = [
      'diamond_ore', 'deepslate_diamond_ore',
      'redstone_ore', 'deepslate_redstone_ore',
      'lapis_ore', 'deepslate_lapis_ore',
      'iron_ore', 'deepslate_iron_ore',
      'coal_ore', 'deepslate_coal_ore'
    ]
    
    let closestOre = null
    let closestDistance = Infinity
    
    for (const oreName of valuableOres) {
      const oreBlock = bot.findBlock({ 
        matching: b => b && b.name === oreName, 
        maxDistance: radius, 
        count: 1 
      })
      
      if (oreBlock) {
        const distance = bot.entity.position.distanceTo(oreBlock.position)
        if (distance < closestDistance) {
          closestDistance = distance
          closestOre = oreBlock
        }
      }
    }
    
    if (closestOre) {
      const oreDisplayName = closestOre.name.replace(/_/g, ' ').replace('deepslate ', '')
      bot.chat(`⛏️ ${oreDisplayName} gevonden op ${closestDistance.toFixed(1)}m`)
      console.log(`[AutoMine] Mining closest ore: ${closestOre.name} at distance ${closestDistance.toFixed(1)}`)
      
      try {
        // ALWAYS equip iron pickaxe before mining
        const ironPick = bot.inventory.items().find(i => i.name === 'iron_pickaxe')
        if (ironPick) {
          await bot.equip(ironPick, 'hand')
          await new Promise(r => setTimeout(r, 200))
          console.log('[AutoMine] Equipped iron_pickaxe for ore mining')
        }
        
        // Direct mining approach: pathfind close, then dig vein
        if (closestDistance > 4.5) {
          console.log('[AutoMine] Navigating to ore...')
          const goal = new goals.GoalNear(closestOre.position.x, closestOre.position.y, closestOre.position.z, 3)
          bot.pathfinder.setGoal(goal)
          
          // Wait max 15 seconds to get close
          const startTime = Date.now()
          while (bot.entity.position.distanceTo(closestOre.position) > 4.5 && Date.now() - startTime < 15000) {
            await new Promise(r => setTimeout(r, 100))
          }
          bot.pathfinder.setGoal(null)
        }
        
        // Now mine the vein from current position
        const vein = findConnectedOres(bot, closestOre, 16)
        if (vein && vein.length > 0) {
          bot.chat(`⛏️ Mining ${vein.length} ${oreDisplayName} blocks...`)
          console.log(`[AutoMine] Found vein of ${vein.length} blocks`)
          
          for (const oreBlock of vein) {
            // Re-equip iron pickaxe before each block
            const ironPick = bot.inventory.items().find(i => i.name === 'iron_pickaxe')
            if (ironPick && bot.heldItem?.name !== 'iron_pickaxe') {
              await bot.equip(ironPick, 'hand')
              await new Promise(r => setTimeout(r, 150))
            }
            
            // Check if block still exists
            const fresh = bot.blockAt(oreBlock.position)
            if (!fresh || !fresh.name.includes('ore')) continue
            
            // Check if reachable
            const dist = bot.entity.position.distanceTo(fresh.position)
            if (dist > 4.5) {
              console.log(`[AutoMine] Block too far (${dist.toFixed(1)}m), skipping`)
              continue
            }
            
            try {
              await bot.dig(fresh)
              console.log(`[AutoMine] Mined ${fresh.name}`)
              await new Promise(r => setTimeout(r, 200))
            } catch (e) {
              console.log(`[AutoMine] Dig error: ${e.message}`)
            }
          }
          
          bot.chat(`✅ Vein gemined!`)
          return true
        }
        
        return true
      } catch (e) {
        console.log(`[AutoMine] Mining error for ${closestOre.name}:`, e.message)
        bot.chat(`⚠️ Mining fout: ${e.message}`)
        return false
      }
    }
    
    return false
  }
  
  // Stone/wood pick can only mine: iron, coal
  let priorities = ['iron_ore', 'deepslate_iron_ore', 'coal_ore', 'deepslate_coal_ore']
  
  // Find nearest by scanning priorities
  for (const name of priorities){
    const block = bot.findBlock({ matching: b => b && b.name === name, maxDistance: radius, count:1 })
    if (block) {
      const oreDisplayName = name.replace(/_/g, ' ').replace('deepslate ', '')
      bot.chat(`⛏️ ${oreDisplayName} gevonden! Mining vein...`)
      
      // Equip best pickaxe available
      const stonePick = bot.inventory.items().find(i => i.name === 'stone_pickaxe')
      const woodPick = bot.inventory.items().find(i => i.name === 'wooden_pickaxe')
      const pickaxe = stonePick || woodPick
      if (pickaxe) {
        await bot.equip(pickaxe, 'hand')
        await new Promise(r => setTimeout(r, 200))
      }
      
      try {
        await mineResource(bot, name, radius)
        return true
      } catch (e) {
        console.log(`[AutoMine] Mining error for ${name}:`, e.message)
        return false
      }
    }
  }
  
  return false
}
      const pickaxe = stonePick || woodPick
      if (pickaxe) {
        await bot.equip(pickaxe, 'hand')
        await new Promise(r => setTimeout(r, 200))
      }
      
      try {
        await mineResource(bot, name, radius)
        return true
      } catch (e) {
        console.log(`[AutoMine] Mining error for ${name}:`, e.message)
        return false
      }
    }
  }
  
  return false
}

async function autoMine(bot, options = {}) {
  const radius = options.radius ?? 32
  bot.chat('⛏️ Auto mine start (alle ertsen)')
  const prevTask = bot.isDoingTask
  bot.isDoingTask = true
  let cycles = 0
  
  try {
    // Step 1: Get wooden pickaxe
    const woodOk = await acquireInitialPick(bot)
    if (!woodOk) { bot.chat('❌ Geen wooden pickaxe kunnen maken'); return 0 }
    bot.chat('✅ Wooden pickaxe klaar')
    
    // Step 2: Upgrade to stone pickaxe (mine cobblestone first)
    const stoneOk = await upgradeToStone(bot)
    if (!stoneOk) { bot.chat('❌ Geen stone pickaxe kunnen maken'); return 0 }
    
    // Verify we have stone pickaxe before proceeding
    let tier = pickTier(bot)
    // Debug: toon alle pickaxes en heldItem
    const debugPicks = bot.inventory.items().filter(i=>i.name && i.name.includes('pickaxe')).map(i=>i.name).join(',')
    const held = bot.heldItem ? bot.heldItem.name : 'none'
    console.log(`[AutoMine][DEBUG] Tier check: tier=${tier}, picks=[${debugPicks}], heldItem=${held}`)
    if (tier !== 'stone' && tier !== 'iron') {
      // Fallback: force equip stone pickaxe if present
      const stonePick = bot.inventory.items().find(i => i.name && i.name.includes('stone_pickaxe'))
      if (stonePick) {
        try {
          await bot.equip(stonePick, 'hand')
          await new Promise(r=>setTimeout(r,150))
          tier = pickTier(bot)
          const held2 = bot.heldItem ? bot.heldItem.name : 'none'
          console.log(`[AutoMine][DEBUG] Na equip: tier=${tier}, heldItem=${held2}`)
        } catch(e){ console.log('[AutoMine] Fallback equip stone error:', e.message) }
      }
      // Accept if stone pickaxe is present after equip
      if (tier === 'stone' || tier === 'iron') {
        bot.chat('🖐️ Stone pickaxe in hand, ga verder met iron mining')
      } else {
        bot.chat('❌ Stone pickaxe upgrade failed (tier=' + tier + ', picks=' + debugPicks + ', held=' + held + ')')
        return 0
      }
    }
    
    // Step 2.5: Iron gathering phase (descend to y16 or collect 3 iron ore)
    await gatherIronPhase(bot)
    
    // Step 3: Mine ores with progressive iron upgrade until inventory full
    let noOreCount = 0
    while (!invFull(bot)) {
      cycles++
      // Attempt iron upgrade when threshold reached
      await upgradeToIron(bot)
      const mined = await gatherNearestOre(bot, radius)
      if (!mined) {
        noOreCount++
        if (noOreCount >= 3) {
          bot.chat('🚧 Geen ertsen meer, start tunnel rechtdoor...')
          // Tunnel straight ahead to find more ores
          try {
            await tunnelStraight(bot, 16) // Tunnel 16 blocks forward
            noOreCount = 0 // Reset after tunneling
          } catch (e) {
            console.log('[AutoMine] Tunnel error:', e.message)
            bot.chat('⏹️ Tunnel fout, stoppen')
            break
          }
        } else {
          // Wait a bit and try again
          await new Promise(r => setTimeout(r, 1000))
        }
        continue
      }
      
      // Reset no-ore counter when we find something
      noOreCount = 0
      
      if (cycles % 5 === 0) {
        bot.chat(`🎒 Slots vrij: ${bot.inventory.emptySlotCount()} | Cycles: ${cycles}`)
      }
    }
    bot.chat(`✅ Auto mine klaar | Cycles: ${cycles} | Slots vrij: ${bot.inventory.emptySlotCount()}`)
  } finally {
    bot.isDoingTask = prevTask
    bot._stairMiningStop = false
  }
}

// Tunnel straight forward to find more ores
async function tunnelStraight(bot, blocks = 16) {
  console.log(`[Tunnel] Starting straight tunnel for ${blocks} blocks`)
  
  // Always use iron pickaxe if available, otherwise best pickaxe
  const ironPick = bot.inventory.items().find(i => i.name === 'iron_pickaxe')
  const stonePick = bot.inventory.items().find(i => i.name === 'stone_pickaxe')
  const woodPick = bot.inventory.items().find(i => i.name === 'wooden_pickaxe')
  const pickaxe = ironPick || stonePick || woodPick
  
  if (pickaxe) {
    await bot.equip(pickaxe, 'hand')
    await new Promise(r => setTimeout(r, 200))
    console.log(`[Tunnel] Equipped ${pickaxe.name} for tunneling`)
  }
  
  const startPos = bot.entity.position.clone()
  const yaw = bot.entity.yaw
  const dx = -Math.sin(yaw)
  const dz = -Math.cos(yaw)
  
  for (let i = 0; i < blocks; i++) {
    const targetX = Math.floor(startPos.x + dx * (i + 1))
    const targetY = Math.floor(startPos.y)
    const targetZ = Math.floor(startPos.z + dz * (i + 1))
    
    // Re-equip pickaxe before each dig cycle to be sure
    if (pickaxe && bot.heldItem?.name !== pickaxe.name) {
      await bot.equip(pickaxe, 'hand')
      await new Promise(r => setTimeout(r, 100))
    }
    
    // Dig 3 blocks high (feet, head, above)
    for (let dy = 0; dy <= 2; dy++) {
      const block = bot.blockAt({ x: targetX, y: targetY + dy, z: targetZ })
      if (block && block.name !== 'air' && block.diggable) {
        try {
          await bot.dig(block, true)
          await new Promise(r => setTimeout(r, 100))
        } catch (e) {
          console.log(`[Tunnel] Dig error at ${targetX},${targetY + dy},${targetZ}:`, e.message)
        }
      }
    }
    
    // Move forward
    try {
      await bot.pathfinder.goto(new goals.GoalBlock(targetX, targetY, targetZ))
      await new Promise(r => setTimeout(r, 200))
    } catch (e) {
      console.log('[Tunnel] Movement error:', e.message)
    }
    
    if (i % 4 === 0) {
      bot.chat(`🚧 Tunnel progress: ${i}/${blocks} blokken`)
    }
  }
  
  bot.chat(`✅ Tunnel klaar: ${blocks} blokken vooruit`)
}

module.exports = { autoMine }
