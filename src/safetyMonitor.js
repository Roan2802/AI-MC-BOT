const { isPositionSafe, findNearbySafePosition, isLavaNearby, isFireNearby } = require('../utils/safety.js');
const { goTo } = require('./navigation.js');

/**
 * Safety monitor: periodically checks bot's surroundings and moves to safe spot.
 */
function startSafetyMonitor(bot, opts = {}) {
  const intervalMs = opts.intervalMs || 3000
  const searchRadius = opts.searchRadius || 6
  if (bot._safetyMonitorId) return

  // Initialize last-state tracking to avoid chat spam
  if (!bot._safetyState) bot._safetyState = { unsafe: false, lastMessages: {} }

  bot._safetyMonitorId = setInterval(async () => {
    try {
      const pos = bot.entity && bot.entity.position
      if (!pos) return

      if (bot._debug) console.log('[SafetyMonitor] raw pos type:', typeof pos, 'pos:', pos)
      const floored = { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) }
      let safe = false
      let lavaNearby = false
      let fireNearby = false
      try {
        safe = isPositionSafe(bot, floored)
      } catch (e) {
        console.error('[SafetyMonitor] isPositionSafe threw:', e && e.message)
        console.error(e && e.stack)
      }
      try {
        lavaNearby = isLavaNearby(bot, floored, 2)
      } catch (e) {
        console.error('[SafetyMonitor] isLavaNearby threw:', e && e.message)
        console.error(e && e.stack)
      }
      try {
        fireNearby = isFireNearby(bot, floored, 1)
      } catch (e) {
        console.error('[SafetyMonitor] isFireNearby threw:', e && e.message)
        console.error(e && e.stack)
      }

      // verbose debug to console when enabled
      if (bot._debug) {
        console.log('[SafetyMonitor] pos=', floored, 'safe=', safe, 'lavaNearby=', lavaNearby, 'fireNearby=', fireNearby)
      }

      const now = Date.now()
      // helper to send chat messages with cooldown per key
      function sendChatWithCooldown(key, message, cooldownMs = 8000) {
        bot._safetyState.lastMessages = bot._safetyState.lastMessages || {}
        const last = bot._safetyState.lastMessages[key] || 0
        if (now - last > cooldownMs) {
          try { bot.chat(message) } catch (e) { console.warn('[SafetyMonitor] chat failed', e && e.message) }
          bot._safetyState.lastMessages[key] = now
        }
      }

      const currentlyUnsafe = (!safe || lavaNearby || fireNearby)
      // If became unsafe, announce once (or with cooldown)
      if (currentlyUnsafe && !bot._safetyState.unsafe) {
        sendChatWithCooldown('becameUnsafe', '⚠️ Omgeving onveilig gedetecteerd — zoek veilige plek...', 10000)
        bot._safetyState.unsafe = true
      }

      if (currentlyUnsafe) {
        try {
          // Do not cancel existing goals preemptively; try to find a safe position first
          const safePos = findNearbySafePosition(bot, floored, searchRadius)
          if (safePos) {
            if (bot._debug) console.log('[SafetyMonitor] navigating to safePos', safePos)
            bot._safetyState.navigating = true
            let reached = false
            try {
              // Cancel current goal only when we are about to navigate to safePos
              if (bot.pathfinder) bot.pathfinder.setGoal(null)
              reached = await goTo(bot, safePos, { checkSafety: false, timeout: 20000 })
            } finally {
              bot._safetyState.navigating = false
            }
            if (reached) {
              if (bot._debug) console.log('[SafetyMonitor] reached safePos')
            }
          } else {
            // No safe position found: just retry pathfinding without blocking
            if (bot._debug) console.warn('[SafetyMonitor] no safe position found, will retry next cycle')
            // Don't stop — let the monitor check again next cycle
          }
        } catch (e) {
          console.error('[SafetyMonitor] herstel mislukt:', e && e.message)
          if (bot._debug) console.error(e && e.stack)
        }
      } else {
        // environment is safe; reset state but don't spam chat
        bot._safetyState.unsafe = false
      }
    } catch (e) {
      console.error('[SafetyMonitor] fout:', e && e.message)
      console.error(e && e.stack)
    }
  }, intervalMs)
}

function stopSafetyMonitor(bot) {
  if (bot._safetyMonitorId) {
    clearInterval(bot._safetyMonitorId)
    delete bot._safetyMonitorId
  }
}

module.exports = { startSafetyMonitor, stopSafetyMonitor };
