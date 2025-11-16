import { findNearbySafePosition } from '../utils/safety.js'
import { goTo } from './navigation.js'
import { tryInitEnhanced, enhancedAttack, enableAutoEat } from './combatEnhanced.js'

function isHostile(entity) {
  if (!entity || !entity.mobType) return false
  const hostileNames = ['zombie', 'skeleton', 'creeper', 'spider', 'pillager', 'hoglin', 'drowned', 'phantom', 'enderman', 'witch']
  const name = (entity.name || '').toLowerCase()
  return hostileNames.some(h => name.includes(h))
}

async function equipBestWeapon(bot) {
  try {
    const items = bot.inventory.items()
    // prefer sword
    let weapon = items.find(i => i.name && i.name.includes('sword'))
    if (!weapon) weapon = items.find(i => i.name && i.name.includes('axe'))
    if (weapon) {
      await bot.equip(weapon, 'hand')
      return true
    }
  } catch (e) {
    // ignore
  }
  return false
}

async function approachAndAttack(bot, entity, opts = {}) {
  if (!entity || !entity.position) return false
  try {
    const targetPos = entity.position
    // approach within 2.5 blocks
    await goTo(bot, { x: targetPos.x, y: targetPos.y, z: targetPos.z }, { timeout: opts.timeout || 15000 })
    await equipBestWeapon(bot)
    // simple attack loop
    const start = Date.now()
    while (entity && entity.health > 0 && Date.now() - start < (opts.maxDuration || 30000)) {
      if (bot.entity.position.distanceTo(entity.position) > 3.5) {
        // re-approach
        await goTo(bot, { x: entity.position.x, y: entity.position.y, z: entity.position.z }, { timeout: 10000 })
      }
      try {
        if (typeof bot.attack === 'function') {
          bot.attack(entity)
        } else {
          // fallback: swing arm
          bot.swingArm()
        }
      } catch (e) {
        // ignore attack errors
      }
      await new Promise(r => setTimeout(r, 700))
    }
    return true
  } catch (e) {
    return false
  }
}

function scanForHostiles(bot, range = 12) {
  const entities = Object.values(bot.entities || {})
  const hostiles = entities.filter(e => e && e.type === 'mob' && isHostile(e) && bot.entity.position.distanceTo(e.position) <= range)
  hostiles.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  return hostiles[0] || null
}

export function startCombatMonitor(bot, opts = {}) {
  const interval = opts.intervalMs || 1200
  if (bot._combatMonitorId) return
  bot._protectTarget = null
  bot._combatMonitorId = setInterval(async () => {
    try {
      if (!bot.entity) return
      // flee when low health
      const lowHealth = (bot.health || 20) <= (opts.fleeHealth || 6)
      if (lowHealth) {
        const safe = findNearbySafePosition(bot, bot.entity.position, 8)
        if (safe) {
          bot.chat('❤️ Laag leven: vluchten naar veilige plek')
          if (bot.pathfinder) bot.pathfinder.setGoal(null)
          await goTo(bot, safe, { timeout: 15000, checkSafety: false })
        }
        return
      }

      // If protecting a player, scan near that player first
      let target = null
      if (bot._protectTarget) {
        const playerEnt = Object.values(bot.entities || {}).find(e => e && e.type === 'player' && e.username === bot._protectTarget)
        if (playerEnt) {
          // find hostile near player
          target = Object.values(bot.entities || {}).find(e => e && e.type === 'mob' && isHostile(e) && playerEnt.position.distanceTo(e.position) <= (opts.protectRange || 10))
        }
      }

      // otherwise scan global
      if (!target) target = scanForHostiles(bot, opts.scanRange || 12)

      if (target) {
        bot.chat(`⚔️ Vijand gedetecteerd: ${target.name}. Engaging...`)
        if (bot._debug) console.log('[Combat] target found', target)
        try {
          if (bot.pathfinder) bot.pathfinder.setGoal(null)
          // prefer enhanced attack if available
          if (enhancedAttack && typeof enhancedAttack === 'function') {
            if (bot._debug) console.log('[Combat] trying enhancedAttack')
            const ok = enhancedAttack(bot, target)
            if (!ok) {
              if (bot._debug) console.log('[Combat] enhancedAttack failed, falling back')
              await approachAndAttack(bot, target, { maxDuration: opts.maxAttackTime || 30000 })
            }
          } else {
            if (bot._debug) console.log('[Combat] using approachAndAttack')
            await approachAndAttack(bot, target, { maxDuration: opts.maxAttackTime || 30000 })
          }
        } catch (e) {
          console.error('[Combat] engage error:', e && e.message)
          if (bot._debug) console.error(e)
        }
      }
    } catch (e) {
      console.error('[Combat] Monitor fout:', e && e.message)
    }
  }, interval)
}

export function stopCombatMonitor(bot) {
  if (bot._combatMonitorId) {
    clearInterval(bot._combatMonitorId)
    delete bot._combatMonitorId
  }
  if (bot._protectTarget) delete bot._protectTarget
}

export function protectPlayer(bot, playerName) {
  if (!playerName) return false
  bot._protectTarget = playerName
  bot.chat(`🛡️ Protect mode: bewaking van ${playerName}`)
  return true
}

export function stopProtect(bot) {
  delete bot._protectTarget
  bot.chat('🛡️ Protect mode uitgeschakeld')
}

export default { startCombatMonitor, stopCombatMonitor, protectPlayer, stopProtect }
