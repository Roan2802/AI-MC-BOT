import { findNearbySafePosition } from '../utils/safety.js'
import { goTo } from './navigation.js'
import { tryInitEnhanced, enhancedAttack, enableAutoEat } from './combatEnhanced.js'
import pathfinderPkg from 'mineflayer-pathfinder'
const { Movements, goals } = pathfinderPkg
const { GoalFollow } = goals

export function isHostile(entity) {
  if (!entity) return false
  // ensure it's a mob
  if (entity.type !== 'mob') return false
  const hostileNames = ['zombie', 'skeleton', 'creeper', 'spider', 'pillager', 'hoglin', 'drowned', 'phantom', 'enderman', 'witch']
  const name = (entity.name || (entity.mobType || '')).toString().toLowerCase()
  return hostileNames.some(h => name.includes(h))
}

async function equipBestWeapon(bot) {
  try {
    const items = bot.inventory.items()
    // prefer sword
    let weapon = items.find(i => i.name && i.name.includes('sword'))
    if (!weapon) weapon = items.find(i => i.name && i.name.includes('axe'))
    if (weapon) {
      if (bot._debug) console.log('[Combat.equipBestWeapon] equipping', weapon.name)
      await bot.equip(weapon, 'hand')
      if (bot._debug) console.log('[Combat.equipBestWeapon] ✅ equipped', weapon.name)
      return true
    } else {
      if (bot._debug) console.log('[Combat.equipBestWeapon] ⚠️ no sword or axe found in inventory')
    }
  } catch (e) {
    console.warn('[Combat.equipBestWeapon] equip error:', e && e.message)
  }
  return false
}

async function approachAndAttack(bot, entity, opts = {}) {
  if (!entity || !entity.position) return false
  try {
    const targetPos = entity.position
    if (bot._debug) console.log('[Combat.approachAndAttack] approaching', entity.name, 'at', targetPos)
    // approach within 2.5 blocks
    await goTo(bot, { x: targetPos.x, y: targetPos.y, z: targetPos.z }, { timeout: opts.timeout || 15000 })
    if (bot._debug) console.log('[Combat.approachAndAttack] ✅ reached target')
    await equipBestWeapon(bot)
    // simple attack loop
    const start = Date.now()
    let attackCount = 0
    while (entity && entity.health > 0 && Date.now() - start < (opts.maxDuration || 30000)) {
      if (bot.entity.position.distanceTo(entity.position) > 3.5) {
        if (bot._debug) console.log('[Combat.approachAndAttack] target too far, re-approaching')
        // re-approach
        await goTo(bot, { x: entity.position.x, y: entity.position.y, z: entity.position.z }, { timeout: 10000 })
      }
      try {
        if (typeof bot.attack === 'function') {
          bot.attack(entity)
          attackCount++
          if (bot._debug) console.log('[Combat.approachAndAttack] attacked (count:', attackCount, ')')
        } else {
          // fallback: swing arm
          bot.swingArm()
          attackCount++
          if (bot._debug) console.log('[Combat.approachAndAttack] swung arm (count:', attackCount, ')')
        }
      } catch (e) {
        console.warn('[Combat.approachAndAttack] attack attempt failed:', e && e.message)
      }
      await new Promise(r => setTimeout(r, 700))
    }
    if (bot._debug) console.log('[Combat.approachAndAttack] ✅ finished attacking', entity.name, 'total attacks:', attackCount)
    return true
  } catch (e) {
    console.warn('[Combat.approachAndAttack] error:', e && e.message)
    return false
  }
}

export function scanForHostiles(bot, range = 12) {
  if (!bot || !bot.entity || !bot.entity.position) return null
  const entities = Object.values(bot.entities || {})
  const hostiles = entities.filter(e => e && e.type === 'mob' && isHostile(e) && bot.entity.position.distanceTo(e.position) <= range)
  hostiles.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))
  if (bot._debug && hostiles.length > 0) {
    console.log('[Combat.scanForHostiles] found', hostiles.length, 'hostile(s) within', range, 'blocks:',
      hostiles.map(h => `${h.name} @ ${Math.round(h.position.x)},${h.position.y},${h.position.z}`).join('; '))
  }
  return hostiles[0] || null
}

export function findHostileNear(bot, centerPos, range = 10) {
  if (!bot || !centerPos) return null
  const entities = Object.values(bot.entities || {})
  const hostiles = entities.filter(e =>
    e &&
    e.type === 'mob' &&
    isHostile(e) &&
    centerPos.distanceTo &&
    centerPos.distanceTo(e.position) <= range
  )
  hostiles.sort((a, b) => centerPos.distanceTo(a.position) - centerPos.distanceTo(b.position))
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
          if (bot._debug) console.log('[Combat] ❤️ low health detected, fleeing to', safe)
          bot.chat('❤️ Laag leven: vluchten naar veilige plek')
          if (bot.pathfinder) bot.pathfinder.setGoal(null)
          await goTo(bot, safe, { timeout: 15000, checkSafety: false })
        }
        return
      }

      // If protecting a player, scan near that player first
      let target = null
      if (bot._protectTarget) {
        // Prefer bot.players lookup (more reliable) then fallback to entities scan
        const playerRecord = bot.players && bot.players[bot._protectTarget]
        let playerEnt = playerRecord && playerRecord.entity
        if (!playerEnt) {
          // fallback: find player entity by username in entities
          playerEnt = Object.values(bot.entities || {}).find(e => e && e.type === 'player' && (e.username === bot._protectTarget || e.name === bot._protectTarget || (e.displayName && e.displayName.getText && e.displayName.getText() === bot._protectTarget)))
        }
        if (!playerEnt) {
          if (bot._debug) console.log('[Combat.protectPlayer] protect target present but player entity not found for', bot._protectTarget, 'bot.players keys:', Object.keys(bot.players || {}))
        } else {
          if (bot._debug) console.log('[Combat.protectPlayer] scanning around', bot._protectTarget, 'at', playerEnt.position)
          // use findHostileNear for more reliable 10-block protect range
          target = findHostileNear(bot, playerEnt.position, opts.protectRange || 10)
          if (target && bot._debug) console.log('[Combat.protectPlayer] threat to', bot._protectTarget, 'found:', target.name, 'distance:', playerEnt.position.distanceTo(target.position))
          
          // Auto-follow protected player if no immediate threat
          if (!target) {
            const distToPlayer = bot.entity.position.distanceTo(playerEnt.position)
            if (distToPlayer > 3) {
              // Follow player at ~2.5 block distance
              try {
                if (bot.pathfinder) {
                  bot.pathfinder.setMovements(new Movements(bot))
                  bot.pathfinder.setGoal(new GoalFollow(playerEnt, 2.5))
                  if (bot._debug) console.log('[Combat.protectPlayer] following', bot._protectTarget, 'dist:', distToPlayer)
                }
              } catch (e) {
                if (bot._debug) console.warn('[Combat.protectPlayer] could not follow:', e && e.message)
              }
            }
          }
        }
      }

      // otherwise scan global
      if (!target) target = scanForHostiles(bot, opts.scanRange || 12)

      if (target) {
        bot.chat(`⚔️ Vijand gedetecteerd: ${target.name}. Engaging...`)
        if (bot._debug) console.log('[Combat] target found:', target.name, 'health:', target.health)
        try {
          if (bot.pathfinder) bot.pathfinder.setGoal(null)
          // prefer enhanced attack if available
          if (enhancedAttack && typeof enhancedAttack === 'function') {
            if (bot._debug) console.log('[Combat] trying enhancedAttack')
            const ok = enhancedAttack(bot, target)
            if (!ok) {
              if (bot._debug) console.log('[Combat] enhancedAttack failed, falling back to approachAndAttack')
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
  if (bot._debug) console.log('[Combat.protectPlayer] protect target set to', playerName)
  return true
}

export function stopProtect(bot) {
  delete bot._protectTarget
  if (bot._debug) console.log('[Combat.stopProtect] protect mode cleared')
}

export default { startCombatMonitor, stopCombatMonitor, protectPlayer, stopProtect, isHostile, scanForHostiles, findHostileNear }
