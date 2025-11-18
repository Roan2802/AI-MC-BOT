// Staircase mining strategy - diagonal downward staircase (1 forward, 1 down)
const { ensurePickaxePrepared } = require('./craft_pickaxe.js')
const { avoidHazards } = require('./safety.js')
const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg
const Vec3 = require('vec3')

function invFull(bot) { return bot.inventory.emptySlotCount() === 0 }

function count(bot, fragment) {
  return bot.inventory.items().filter(i => i.name && i.name.includes(fragment)).reduce((s,it)=>s+it.count,0)
}

async function digIfNeeded(bot, pos) {
  const block = bot.blockAt(pos)
  if (!block || block.name === 'air') return
  if (!block.diggable) return
  try { 
    bot._isDigging = true
    await bot.dig(block)
    bot._isDigging = false
    await new Promise(r => setTimeout(r, 100))
  } catch(e){ 
    bot._isDigging=false 
  }
}

async function staircaseMine(bot, options = {}) {
  const targetY = options.targetY ?? 12
  const maxSteps = options.maxSteps ?? 100
  const pickPreference = options.pickPreference ?? 'stone'
  const targetCobble = options.targetCobble ?? 0
  
  // Set task flag to prevent stuck detector interference
  bot.isDoingTask = true
  
  bot.chat(`⛏️ Staircase mining start (doel: ${targetCobble > 0 ? targetCobble + ' cobblestone' : 'y=' + targetY})`)

  // Ensure we have a pickaxe (only if we don't have one already)
  const existingPick = bot.inventory.items().find(i => i.name && i.name.includes('pickaxe'))
  if (!existingPick) {
    const pickOk = await ensurePickaxePrepared(bot, pickPreference)
    if (!pickOk) { bot.chat('❌ Geen pickaxe kunnen maken'); return 0 }
  }

  let steps = 0
  
  // Pick a direction based on bot's current yaw
  const yaw = bot.entity.yaw
  let dir = new Vec3(0, 0, 0)
  
  // Round yaw to nearest cardinal direction
  const normalizedYaw = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  if (normalizedYaw < Math.PI / 4 || normalizedYaw >= 7 * Math.PI / 4) {
    dir = new Vec3(0, 0, 1)  // South
  } else if (normalizedYaw >= Math.PI / 4 && normalizedYaw < 3 * Math.PI / 4) {
    dir = new Vec3(-1, 0, 0)  // West
  } else if (normalizedYaw >= 3 * Math.PI / 4 && normalizedYaw < 5 * Math.PI / 4) {
    dir = new Vec3(0, 0, -1)  // North
  } else {
    dir = new Vec3(1, 0, 0)  // East
  }
  
  // Store direction on bot for later use (e.g., crafting table placement)
  bot._staircaseDirection = dir

  try {
    while (steps < maxSteps && Math.floor(bot.entity.position.y) > targetY) {
      if (invFull(bot)) { bot.chat('🎒 Inventaris vol — stoppen'); break }
      if (bot._stairMiningStop) { bot.chat('⏹️ Stop aangevraagd'); break }
      
      // Check if we have enough cobblestone
      if (count(bot, 'cobblestone') >= targetCobble) {
        bot.chat(`✅ ${count(bot,'cobblestone')} cobblestone verzameld!`)
        break
      }

      const pos = bot.entity.position.floored()
      
      // Dig pattern for staircase: 
      // Step 1: Clear 2 blocks high in front (at current level)
      // Step 2: Clear block below front
      // Step 3: Move forward and down
      
      // Current level: 2 blocks high ahead
      const ahead1 = pos.offset(dir.x, 0, dir.z)
      const ahead1Up = pos.offset(dir.x, 1, dir.z)
      
      // Dig ahead at current level (2-high)
      await digIfNeeded(bot, ahead1)
      await digIfNeeded(bot, ahead1Up)
      
      // Move forward
      try {
        const movements = new Movements(bot)
        movements.canDig = true
        bot.pathfinder.setMovements(movements)
        const goal = new goals.GoalBlock(ahead1.x, ahead1.y, ahead1.z)
        await bot.pathfinder.goto(goal)
      } catch(e) {
        console.log('[Staircase] Movement error:', e.message)
      }
      
      // Now dig the block we're standing on (to go down)
      const below = bot.entity.position.floored().offset(0, -1, 0)
      await digIfNeeded(bot, below)
      
      // Wait to fall down
      await new Promise(r => setTimeout(r, 300))
      
      steps++
      if (steps % 5 === 0) {
        bot.chat(`⬇️ Stap ${steps}, y=${Math.floor(bot.entity.position.y)}, cobble=${count(bot,'cobblestone')}`)
      }
    }
  } catch(e) {
    console.log('[Staircase] Error:', e.message)
  } finally {
    bot._isDigging = false
  }

  bot.chat(`✅ Staircase klaar: y=${Math.floor(bot.entity.position.y)}, cobble=${count(bot,'cobblestone')}, stappen=${steps}`)
  return steps
}

module.exports = { staircaseMine }
