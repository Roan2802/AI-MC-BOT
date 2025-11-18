// Mining Advanced - manager
const { branchMine } = require('./strategy_branch.js')

function isMiningActive(bot) { return !!bot._branchMiningActive }

async function startBranchMining(bot, opts = {}) {
  if (isMiningActive(bot)) {
    bot.chat('⛏️ Branch mining al actief')
    return
  }
  bot._branchMiningActive = true
  bot._branchMiningStop = false
  bot.isDoingTask = true // reuse stuck detector gating
  bot._branchMineCenter = bot.entity.position.floored()

  const options = {
    yLevel: opts.yLevel ?? 12,
    branchLength: opts.branchLength ?? 16,
    branches: opts.branches ?? 4,
    pickPreference: opts.pickPreference ?? 'stone',
    center: bot._branchMineCenter
  }
  try {
    await branchMine(bot, options)
  } catch (e) {
    bot.chat('❌ Branch mining fout: ' + e.message)
  } finally {
    bot.isDoingTask = false
    bot._branchMiningActive = false
    bot._branchMiningStop = false
  }
}

function stopBranchMining(bot) {
  if (!isMiningActive(bot)) {
    bot.chat('ℹ️ Geen branch mining actief')
    return
  }
  bot._branchMiningStop = true
  bot.chat('⏹️ Branch mining stop aangevraagd')
}

module.exports = { startBranchMining, stopBranchMining, isMiningActive }
