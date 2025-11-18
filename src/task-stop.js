// Global task stop helper: aborts any ongoing custom loops (wood harvesting, mining, follow, etc.)
function stopAllTasks(bot, reason = 'manual_stop') {
  try {
    bot._abortTasks = true
    // Close any crafting/inventory window to prevent lingering recipes
    try { if (bot.currentWindow) bot.closeWindow(bot.currentWindow) } catch (e) {}
    // Attempt to cancel any active dig immediately
    try { if (bot.stopDigging) bot.stopDigging(); } catch (e) {}
    // Mining
    if (bot._isMining) {
      bot._isMining = false
      if (bot._miningState) bot._miningState.abortReason = reason
    }
    // Wood harvesting does not have an explicit flag; loops will check _abortTasks.
    // Combat follow / movement
    try { if (bot.pathfinder) bot.pathfinder.setGoal(null) } catch (e) {}
    // Clear basic movement controls
    const controls = ['forward','back','left','right','jump','sprint']
    for (const c of controls) { try { bot.setControlState(c, false) } catch (e) {} }
    // Stop following
    if (bot._followingPlayer) bot._followingPlayer = null
    if (bot._followInterval) { try { clearInterval(bot._followInterval) } catch (e) {} bot._followInterval = null }
    // General task flag
    bot.isDoingTask = false
    bot.chat('⛔ Alle taken gestopt')
  } catch (e) {
    bot.chat('❌ Stop mislukt: ' + e.message)
  }
}

module.exports = { stopAllTasks }