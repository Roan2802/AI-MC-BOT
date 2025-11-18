// Mining Advanced - branch mining strategy
const { avoidHazards } = require('./safety.js')
const { ensureMiningPick } = require('./tools.js')
const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg

async function descendToY(bot, targetY) {
  let attempts = 0
  while (Math.floor(bot.entity.position.y) > targetY && attempts < 64) {
    attempts++
    const below = bot.blockAt(bot.entity.position.offset(0, -1, 0).floored())
    if (below && below.name !== 'air' && below.diggable) {
      try { await bot.dig(below) } catch(e) {}
    } else {
      bot.setControlState('forward', true)
      await new Promise(r => setTimeout(r, 400))
      bot.setControlState('forward', false)
    }
    await new Promise(r => setTimeout(r, 200))
  }
}

async function digForward(bot, steps, height = 2) {
  for (let i = 0; i < steps; i++) {
    if (bot._branchMiningStop) return
    await avoidHazards(bot)
    // Dig front blocks at each height layer
    for (let h = 0; h < height; h++) {
      const targetPos = bot.entity.position.offset(Math.sin(bot.entity.yaw), h, Math.cos(bot.entity.yaw)).floored()
      const block = bot.blockAt(targetPos)
      if (block && block.name !== 'air' && block.diggable) {
        try { await bot.dig(block) } catch(e) {}
      }
    }
    // Move forward
    bot.setControlState('forward', true)
    await new Promise(r => setTimeout(r, 500))
    bot.setControlState('forward', false)
  }
}

async function branchMine(bot, options = {}) {
  const yLevel = options.yLevel ?? 12
  const branchLength = options.branchLength ?? 16
  const branches = options.branches ?? 4
  const pickPref = options.pickPreference ?? 'stone'

  await ensureMiningPick(bot, pickPref)

  bot.chat(`⛏️ Branch mining start (y=${yLevel}, len=${branchLength}, branches=${branches})`)
  await descendToY(bot, yLevel)

  // Create branching tunnels cardinal directions
  const directions = [0, Math.PI/2, Math.PI, 3*Math.PI/2]
  for (let d = 0; d < directions.length && d < branches; d++) {
    if (bot._branchMiningStop) break
    bot.chat(`➡️ Branch ${d+1}/${branches}`)
    bot.entity.yaw = directions[d]
    await digForward(bot, branchLength, 2)
    // Return to center
    bot.chat('↩️ Terug naar center')
    const center = options.center || options.startPos || bot._branchMineCenter
    if (center) {
      try {
        const movements = new Movements(bot)
        bot.pathfinder.setMovements(movements)
        const goal = new goals.GoalNear(center.x, center.y, center.z, 2)
        await bot.pathfinder.goto(goal)
      } catch(e) {}
    }
  }
  bot.chat('✅ Branch mining klaar')
}

module.exports = { branchMine }
