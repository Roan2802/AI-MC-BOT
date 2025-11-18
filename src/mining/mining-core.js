const { mergeMiningConfig } = require('./mining-config.js')
const { initMiningState, updateAfterDig } = require('./mining-state.js')
const { ensurePickaxeFor } = require('./mining-tools.js')
const { isBlockSafeToMine } = require('./mining-safety.js')
const pathfinderPkg = require('mineflayer-pathfinder')
const Movements = pathfinderPkg.Movements
const goals = pathfinderPkg.goals

async function startMining(bot, options = {}) {
  if (bot._isMining) {
    bot.chat('⛏️ Al bezig met minen')
    return false
  }
  if (bot._abortTasks) bot._abortTasks = false
  const config = mergeMiningConfig(options.config)
  const state = initMiningState(bot)
  bot._miningConfig = config
  bot._miningState = state
  bot._isMining = true
  bot.isDoingTask = true

  bot.chat('⛏️ Mining gestart (staircase Phase1)')
  // Ensure pickaxe for stone baseline
  const ok = await ensurePickaxeFor(bot, 'stone')
  if (!ok) {
    bot.chat('❌ Geen pickaxe beschikbaar')
    stopMining(bot, 'no_pickaxe')
    return false
  }
  state.mode = bot.entity.position.y > config.targetYForDiamond ? 'staircase' : 'branch_pending'
  runMiningLoop(bot).catch(e => {
    bot.chat('❌ Mining error: ' + e.message)
    stopMining(bot, 'error')
  })
  return true
}

async function runMiningLoop(bot) {
  while (bot._isMining) {
    const config = bot._miningConfig
    const state = bot._miningState
    if (!config || !state) break

    // Abort conditions
    if (Date.now() - state.startedAt > config.maxSessionDuration) {
      stopMining(bot, 'time')
      break
    }

    if (state.mode === 'staircase') {
      const cont = await stepStaircase(bot, state, config)
      if (!cont) {
        state.mode = 'branch_pending'
      }
    } else if (state.mode === 'branch_pending') {
      // Phase1 placeholder: stop after staircase for now
      stopMining(bot, 'staircase_complete')
      break
    }

    await new Promise(r => setTimeout(r, 250))
  }
}

async function stepStaircase(bot, state, config) {
  // Stop descending once at target Y
  if (bot.entity.position.y <= config.targetYForDiamond) return false
  const forwardDir = directionVector(bot)
  const forwardPos = bot.entity.position.floored().offset(forwardDir.x, 0, forwardDir.z)
  const downPos = forwardPos.offset(0, -1, 0)

  // Mine forward block (head clearance) and down block for step
  const targets = [ bot.blockAt(forwardPos), bot.blockAt(downPos) ]
  for (const blk of targets) {
    if (!blk || blk.name === 'air') continue
    if (!isBlockSafeToMine(bot, blk, config)) continue
    try {
      await ensurePickaxeFor(bot, blk.name)
      await digWithMove(bot, blk)
      updateAfterDig(state, blk)
    } catch (e) {}
  }
  // Move into carved space
  try {
    const movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)
    const goal = new goals.GoalNear(forwardPos.x, forwardPos.y, forwardPos.z, 1)
    await bot.pathfinder.goto(goal)
  } catch (e) {}
  return true
}

function directionVector(bot) {
  const yaw = bot.entity.yaw
  return { x: Math.round(Math.sin(yaw)), z: Math.round(Math.cos(yaw)) }
}

async function digWithMove(bot, block) {
  const dist = bot.entity.position.distanceTo(block.position)
  if (dist > 4) {
    try {
      const movements = new Movements(bot)
      bot.pathfinder.setMovements(movements)
      const goal = new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2)
      await bot.pathfinder.goto(goal)
    } catch (e) {}
  }
  await bot.dig(block)
}

function getMiningStatus(bot) {
  const state = bot._miningState
  if (!state) return null
  return {
    mode: state.mode,
    minedBlocks: state.minedBlocks,
    minedOres: state.minedOres,
    elapsedMs: Date.now() - state.startedAt,
    currentY: state.currentY,
    abortReason: state.abortReason
  }
}

function stopMining(bot, reason = 'manual') {
  if (!bot._isMining) return
  bot._isMining = false
  bot.isDoingTask = false
  if (bot._miningState) bot._miningState.abortReason = reason
  bot.chat('⛏️ Mining gestopt (' + reason + ')')
}

module.exports = { startMining, stopMining, getMiningStatus }
