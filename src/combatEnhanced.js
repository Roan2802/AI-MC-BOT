/**
 * Optional enhanced combat integrations using external plugins.
 * Tries to load `mineflayer-pvp`, `mineflayer-auto-eat` and `minecraft-data`.
 * Falls back gracefully if packages are not installed.
 */
let hasPvp = false
let hasAutoEat = false

export async function tryInitEnhanced(bot) {
  try {
    const pvpMod = await import('mineflayer-pvp')
    const pvpPlugin = pvpMod.plugin || pvpMod.default || pvpMod
    bot.loadPlugin(pvpPlugin)
    hasPvp = true
    console.log('[CombatEnhanced] mineflayer-pvp loaded')
  } catch (e) {
    console.log('[CombatEnhanced] mineflayer-pvp not available:', e && e.message)
    hasPvp = false
  }

  try {
    const ae = await import('mineflayer-auto-eat')
    const autoEatPlugin = ae.default || ae
    bot.loadPlugin(autoEatPlugin)
    hasAutoEat = true
    console.log('[CombatEnhanced] mineflayer-auto-eat loaded')
  } catch (e) {
    console.log('[CombatEnhanced] mineflayer-auto-eat not available:', e && e.message)
    hasAutoEat = false
  }

  // Attempt to load minecraft-data for better mob names if available
  try {
    const mcdata = await import('minecraft-data')
    bot._mcData = mcdata.default(bot.version)
    console.log('[CombatEnhanced] minecraft-data loaded for version', bot.version)
  } catch (e) {
    console.log('[CombatEnhanced] minecraft-data not available:', e && e.message)
  }
}

export function enhancedAttack(bot, entity) {
  if (!entity) return false
  if (hasPvp && bot.pvp) {
    try {
      bot.pvp.attack(entity)
      return true
    } catch (e) {
      console.warn('[CombatEnhanced] pvp.attack failed:', e && e.message)
      return false
    }
  }
  // fallback: use simple attack if available
  try {
    if (typeof bot.attack === 'function') {
      bot.attack(entity)
      return true
    }
  } catch (e) {
    // ignore
  }
  return false
}

export function enableAutoEat(bot, opts = {}) {
  if (hasAutoEat && bot.autoEat) {
    try {
      bot.autoEat.options = bot.autoEat.options || {}
      bot.autoEat.options.priority = opts.priority || 'foodPoints'
      bot.autoEat.start()
      console.log('[CombatEnhanced] autoEat started')
      return true
    } catch (e) {
      console.warn('[CombatEnhanced] autoEat start failed:', e && e.message)
      return false
    }
  }
  console.log('[CombatEnhanced] autoEat not available')
  return false
}

export function disableAutoEat(bot) {
  if (hasAutoEat && bot.autoEat && typeof bot.autoEat.stop === 'function') {
    try { bot.autoEat.stop(); return true } catch (e) { return false }
  }
  return false
}

export default { tryInitEnhanced, enhancedAttack, enableAutoEat, disableAutoEat }
