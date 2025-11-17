/**
 * Optional enhanced combat integrations using external plugins.
 * Tries to load `mineflayer-pvp`, `mineflayer-auto-eat` and `minecraft-data`.
 * Falls back gracefully if packages are not installed.
 */
let hasPvp = false
let hasAutoEat = false

function tryInitEnhanced(bot) {
  try {
    const pvpPlugin = require('mineflayer-pvp').plugin
    bot.loadPlugin(pvpPlugin)
    hasPvp = true
    console.log('[CombatEnhanced] ✅ mineflayer-pvp loaded')
  } catch (e) {
    console.log('[CombatEnhanced] ⚠️ mineflayer-pvp not available:', e && e.message)
    hasPvp = false
  }

  try {
    const autoEatPlugin = require('mineflayer-auto-eat').plugin
    if (typeof autoEatPlugin === 'function') {
      bot.loadPlugin(autoEatPlugin)
      hasAutoEat = true
      console.log('[CombatEnhanced] ✅ mineflayer-auto-eat loaded')
    } else {
      console.log('[CombatEnhanced] ⚠️ mineflayer-auto-eat plugin is not a function, skipping')
      hasAutoEat = false
    }
  } catch (e) {
    console.log('[CombatEnhanced] ⚠️ mineflayer-auto-eat not available:', e && e.message)
    hasAutoEat = false
  }

  // Attempt to load minecraft-data for better mob names if available
  try {
    const mcdata = require('minecraft-data')
    bot._mcData = mcdata(bot.version)
    console.log('[CombatEnhanced] ✅ minecraft-data loaded for version', bot.version)
  } catch (e) {
    console.log('[CombatEnhanced] ⚠️ minecraft-data not available:', e && e.message)
  }
}

function enhancedAttack(bot, entity) {
  if (!entity) return false
  if (hasPvp && bot.pvp) {
    try {
      bot.pvp.attack(entity)
      if (bot._debug) console.log('[CombatEnhanced] pvp.attack called on', entity.name)
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
      if (bot._debug) console.log('[CombatEnhanced] bot.attack() called')
      return true
    }
  } catch (e) {
    // ignore
  }
  return false
}

function enableAutoEat(bot, opts = {}) {
  if (hasAutoEat && bot.autoEat) {
    try {
      bot.autoEat.options = bot.autoEat.options || {}
      bot.autoEat.options.priority = opts.priority || 'foodPoints'
      if (typeof bot.autoEat.start === 'function') {
        bot.autoEat.start()
        console.log('[CombatEnhanced] ✅ autoEat started')
        return true
      }
    } catch (e) {
      console.warn('[CombatEnhanced] autoEat start failed:', e && e.message)
      return false
    }
  }
  if (bot._debug) console.log('[CombatEnhanced] autoEat not available or started')
  return false
}

function disableAutoEat(bot) {
  if (hasAutoEat && bot.autoEat && typeof bot.autoEat.stop === 'function') {
    try { bot.autoEat.stop(); return true } catch (e) { return false }
  }
  return false
}

module.exports = { tryInitEnhanced, enhancedAttack, enableAutoEat, disableAutoEat }
module.exports.tryInitEnhanced = tryInitEnhanced
module.exports.enhancedAttack = enhancedAttack
module.exports.enableAutoEat = enableAutoEat
module.exports.disableAutoEat = disableAutoEat
