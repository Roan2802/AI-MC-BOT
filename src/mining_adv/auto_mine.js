// Auto mining loop: progressive pickaxe upgrade (wood -> stone -> iron) and ore collection until inventory full.
const { ensurePickaxePrepared } = require('./craft_pickaxe.js')
const { ensureIronPickaxe, ensureStonePickaxe } = require('../crafting-tools.js')
const { ensureCraftingTable } = require('../crafting-blocks.js')
const { ensureCraftingTableOpen } = require('../crafting-recipes.js')
const { smeltOres } = require('../smelting.js')
const { staircaseMine } = require('./strategy_staircase.js')
const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg
const { mineResource } = require('../mining.js')

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
    // Place from inventory
    const ground = bot.blockAt(bot.entity.position.offset(0,-1,0))
    if (ground && ground.name !== 'air') {
      try { 
        await bot.equip(furnaceInv,'hand')
        await bot.placeBlock(ground,{x:0,y:1,z:0})
        bot.chat('🔥 Furnace geplaatst')
        await new Promise(r => setTimeout(r, 300))
        return bot.findBlock({ matching: b => b && (b.name === 'furnace' || b.name === 'blast_furnace'), maxDistance: 6, count:1 })
      } catch(e){
        console.log('[Furnace] Placement error:', e.message)
      }
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
    const recipes = bot.recipesFor(furnaceItem.id, null, 1, bot.findBlock({ matching: b=>b && b.name==='crafting_table', maxDistance:6, count:1 }))
    if (recipes && recipes.length > 0) {
      await bot.craft(recipes[0], 1)
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
  
  // Place furnace on ground
  const ground = bot.blockAt(bot.entity.position.offset(0,-1,0))
  const newFurnaceInv = bot.inventory.items().find(i=>i.name==='furnace')
  if (ground && ground.name !== 'air' && newFurnaceInv) {
    try { 
      await bot.equip(newFurnaceInv,'hand')
      await bot.placeBlock(ground,{x:0,y:1,z:0})
      bot.chat('🔥 Furnace geplaatst')
      await new Promise(r => setTimeout(r, 300))
    } catch(e){
      console.log('[Furnace] Placement error:', e.message)
    }
  }
  
  return bot.findBlock({ matching: b => b && (b.name === 'furnace' || b.name === 'blast_furnace'), maxDistance: 6, count:1 })
}

function pickTier(bot){
  // Check for working pickaxes (not broken)
  const picks = bot.inventory.items().filter(i => i.name && i.name.includes('pickaxe'))
  
  for (const pick of picks) {
    // Skip broken tools (0 durability left)
    if (pick.nbt && pick.nbt.value && pick.nbt.value.Damage) {
      const maxDurability = pick.maxDurability || 1561 // default to diamond durability
      const damage = pick.nbt.value.Damage.value
      if (damage >= maxDurability) continue // broken
    }
    
    if (pick.name === 'iron_pickaxe' || pick.name === 'diamond_pickaxe') return 'iron'
    if (pick.name === 'stone_pickaxe') return 'stone'
    if (pick.name === 'wooden_pickaxe') return 'wood'
  }
  
  return 'none'
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
        maxSteps: 100, 
        pickPreference: 'wood',
        targetCobble: 3 
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
    // Cleanup table
    try {
      bot._isDigging = true
      await bot.dig(tableExists)
      bot._isDigging = false
      bot.chat('🗑️ Crafting table opgeruimd')
      await new Promise(r=>setTimeout(r,500))
    } catch(e) { bot._isDigging = false }

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
    bot.chat(`🔨 Crafting iron pickaxe (${ingots} iron ingots)...`)
    const tableOk = await ensureCraftingTable(bot)
    if (!tableOk) {
      bot.chat('❌ Kan crafting table niet maken')
      return false
    }
    const crafted = await ensureIronPickaxe(bot)
    if (crafted) {
      bot.chat('✅ Iron pickaxe gemaakt!')
    }
    return crafted
  }
  
  // Check if we have enough raw iron/ore to smelt
  const ironOreCount = bot.inventory.items().filter(i => i.name === 'iron_ore' || i.name === 'raw_iron' || i.name === 'deepslate_iron_ore').reduce((s,it)=>s+it.count,0)
  if (ironOreCount < 3) {
    return false // Not enough material yet
  }
  
  bot.chat(`🔥 Smelting ${ironOreCount} iron ore...`)
  
  // Ensure furnace exists
  const furnace = await craftFurnaceIfNeeded(bot)
  if (!furnace) {
    bot.chat('❌ Kan geen furnace maken (niet genoeg cobblestone)')
    return false
  }
  
  // Smelt the iron ore
  try { 
    await smeltOres(bot, 10) 
    bot.chat('✅ Iron ore gesmelt')
  } catch(e){ 
    console.log('[AutoMine] Smelting error:', e.message)
    bot.chat('⚠️ Smelting error')
  }
  
  // Check if we now have enough ingots
  const newIngots = count(bot,'iron_ingot')
  if (newIngots < 3) {
    bot.chat(`⚠️ Niet genoeg iron ingots na smelten (${newIngots}/3)`)
    return false
  }
  
  // Craft iron pickaxe
  bot.chat(`🔨 Crafting iron pickaxe (${newIngots} iron ingots)...`)
  const tableOk = await ensureCraftingTable(bot)
  if (!tableOk) {
    bot.chat('❌ Kan crafting table niet maken')
    return false
  }
  
  const crafted = await ensureIronPickaxe(bot)
  if (crafted) {
    bot.chat('✅ Iron pickaxe gemaakt!')
  }
  return crafted
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
      return e.displayName === 'Item' || e.objectType === 'Item'
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
  // Priority order - filter by current pick tier
  const tier = pickTier(bot)
  let priorities = ['diamond_ore','emerald_ore','redstone_ore','lapis_ore','gold_ore','copper_ore','iron_ore','coal_ore']
  
  // Stone/wood pick can only mine: iron, coal (NOT copper - requires stone+ in newer versions)
  if (tier === 'stone' || tier === 'wood') {
    priorities = ['iron_ore','coal_ore']
  }
  
  // Find nearest by scanning priorities
  for (const name of priorities){
    const block = bot.findBlock({ matching: b => b && b.name === name, maxDistance: radius, count:1 })
    if (block) {
      await mineResource(bot, name, radius)
      return true
    }
  }
  // Fallback: any minable ore (skip if we don't have right tool)
  const anyOre = bot.findBlock({ matching: b => b && b.name && b.name.includes('ore'), maxDistance: radius, count:1 })
  if (anyOre) { 
    // Only try if we think we can mine it (iron pick can mine all, stone/wood only iron/coal)
    if (tier === 'iron' || ['iron_ore','coal_ore'].some(ok => anyOre.name.includes(ok))) {
      await mineResource(bot, anyOre.name, radius)
      return true
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
    const tier = pickTier(bot)
    if (tier !== 'stone' && tier !== 'iron') {
      bot.chat('❌ Stone pickaxe upgrade failed')
      return 0
    }
    
    // Step 2.5: Iron gathering phase (descend to y16 or collect 3 iron ore)
    await gatherIronPhase(bot)
    
    // Step 3: Mine ores with progressive iron upgrade
    while (!invFull(bot)) {
      cycles++
      // Attempt iron upgrade when threshold reached
      await upgradeToIron(bot)
      const mined = await gatherNearestOre(bot, radius)
      if (!mined) {
        bot.chat('⏹️ Geen ertsen meer binnen bereik')
        break
      }
      if (cycles % 5 === 0) {
        bot.chat(`🎒 Slots vrij: ${bot.inventory.emptySlotCount()} | Iron ingots: ${count(bot,'iron_ingot')}`)
      }
    }
    bot.chat('✅ Auto mine klaar (inventaris vol of geen ertsen)')
  } finally {
    bot.isDoingTask = prevTask
    bot._stairMiningStop = false
  }
}

module.exports = { autoMine }
