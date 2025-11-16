import { isPositionSafe, findNearbySafePosition, isLavaNearby, isFireNearby } from '../utils/safety.js'
import { goTo } from './navigation.js'

/**
 * Safety monitor: periodically checks bot's surroundings and moves to safe spot.
 */
export function startSafetyMonitor(bot, opts = {}) {
  const intervalMs = opts.intervalMs || 1500
  const searchRadius = opts.searchRadius || 6
  if (bot._safetyMonitorId) return

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

      if (!safe || lavaNearby || fireNearby) {
        try {
          bot.chat('⚠️ Omgeving onveilig gedetecteerd — zoek veilige plek...')
          // stop current path
          if (bot.pathfinder) bot.pathfinder.setGoal(null)
          const safePos = findNearbySafePosition(bot, floored, searchRadius)
          if (safePos) {
            bot.chat(`🚨 Ga naar veilige positie ${Math.round(safePos.x)},${Math.round(safePos.y)},${Math.round(safePos.z)}`)
            if (bot._debug) console.log('[SafetyMonitor] navigating to safePos', safePos)
            await goTo(bot, safePos, { checkSafety: false, timeout: 20000 })
            bot.chat('✅ Bereikt veilige positie')
            if (bot._debug) console.log('[SafetyMonitor] reached safePos')
          } else {
            bot.chat('❌ Geen veilige positie gevonden — wachten en blokkeren acties')
            if (bot.pathfinder) bot.pathfinder.setGoal(null)
            if (bot._debug) console.warn('[SafetyMonitor] no safe position found')
          }
        } catch (e) {
          console.error('[SafetyMonitor] herstel mislukt:', e && e.message)
          console.error(e && e.stack)
        }
      }
    } catch (e) {
      console.error('[SafetyMonitor] fout:', e && e.message)
      console.error(e && e.stack)
    }
  }, intervalMs)
}

export function stopSafetyMonitor(bot) {
  if (bot._safetyMonitorId) {
    clearInterval(bot._safetyMonitorId)
    delete bot._safetyMonitorId
  }
}

export default { startSafetyMonitor, stopSafetyMonitor }
