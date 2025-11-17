
// GuardianBot Combat System v1 – Hybrid Tactical
const pathfinderPkg = require('mineflayer-pathfinder')
const { goals } = pathfinderPkg
const { GoalFollow } = goals

/**
 * @typedef {Object} CombatConfig
 * @property {number} detectionRadius
 * @property {number} priorityRadius
 * @property {number} maxHuntDistance
 * @property {number} followDistance
 * @property {number} creeperEvadeRadius
 * @property {number} ownerSafeHealth
 * @property {number} resumeFollowMs
 * @property {boolean} enablePvpDefense
 */

function initCombatSystem(bot, config) {
  const state = {
    mode: 'FOLLOW',
    ownerName: null,
    currentTargetId: null,
    lastThreatTime: 0
  }

  const HOSTILE_MOBS = [
    'Zombie', 'Husk', 'Drowned',
    'Skeleton', 'Stray', 'Wither Skeleton',
    'Spider', 'Cave Spider',
    'Pillager', 'Vindicator', 'Evoker',
    'Ravager', 'Slime', 'Magma Cube',
    'Enderman', 'Endermite'
  ]

  function log(msg, extra) {
    const DEBUG = true
    if (!DEBUG) return
    const time = new Date().toISOString()
    console.log(`[Combat ${time}] ${msg}`, extra || '')
  }

  function getOwnerEntity() {
    if (!state.ownerName) return null
    return bot.players[state.ownerName]?.entity ?? null
  }

  function getHealth(entity) {
    return typeof entity.health === 'number' ? entity.health : 20
  }

  function findBestThreat() {
    const owner = getOwnerEntity()
    if (!owner) return null
    let best = null
    let bestScore = 0
    for (const id in bot.entities) {
      const e = bot.entities[id]
      if (!e || e === bot.entity) continue
      if (e.type !== 'mob') continue
      if (!e.mobType) continue
      const distOwner = owner.position.distanceTo(e.position)
      if (distOwner > config.detectionRadius) continue
      const isCreeper = e.mobType.includes('Creeper')
      const isHostile = HOSTILE_MOBS.some(m => e.mobType.includes(m))
      if (!isCreeper && !isHostile) continue
      let base = 1
      if (isCreeper) base = 100
      else if (e.mobType.includes('Skeleton') || e.mobType.includes('Pillager')) base = 40
      else if (e.mobType.includes('Spider')) base = 25
      else base = 15
      const distanceFactor = Math.max(0, (config.detectionRadius - distOwner))
      const priorityBoost = distOwner <= config.priorityRadius ? 30 : 0
      const score = base + distanceFactor + priorityBoost
      if (score > bestScore) {
        bestScore = score
        best = e
      }
    }
    return best
  }

  function isOwnerSafe() {
    const owner = getOwnerEntity()
    if (!owner) return false
    if (getHealth(owner) < config.ownerSafeHealth) return false
    for (const id in bot.entities) {
      const e = bot.entities[id]
      if (!e || e.type !== 'mob' || !e.mobType) continue
      const isCreeper = e.mobType.includes('Creeper')
      const isHostile = HOSTILE_MOBS.some(m => e.mobType.includes(m))
      if (!isCreeper && !isHostile) continue
      const distOwner = owner.position.distanceTo(e.position)
      if (distOwner <= config.priorityRadius) {
        return false
      }
    }
    return true
  }

  async function equipBestWeapon() {
    try {
      const items = bot.inventory.items()
      const swords = items.filter(i => i.name.includes('sword'))
      const axes = items.filter(i => i.name.includes('axe'))
      if (swords.length > 0) {
        await bot.equip(swords.sort((a, b) => b.attackDamage - a.attackDamage)[0], 'hand')
        log('Equipped best sword')
      } else if (axes.length > 0) {
        await bot.equip(axes.sort((a, b) => b.attackDamage - a.attackDamage)[0], 'hand')
        log('Equipped best axe')
      }
    } catch (err) {
      log('equipBestWeapon error', err)
    }
  }

  async function ensureArmor() {
    if (!bot.armorManager) return
    try {
      await bot.armorManager.equipAll()
    } catch (err) {
      log('equipAll armor error', err)
    }
  }

  function enterFollowMode() {
    const owner = getOwnerEntity()
    if (!owner) return
    state.mode = 'FOLLOW'
    state.currentTargetId = null
    bot.pvp?.stop()
    log('STATE -> FOLLOW')
    bot.pathfinder.setGoal(new GoalFollow(owner, config.followDistance), true)
  }

  async function enterCombatMode(target) {
    if (state.mode === 'COMBAT' && state.currentTargetId === target.id) return
    state.mode = 'COMBAT'
    state.currentTargetId = target.id
    log(`STATE -> COMBAT vs ${target.mobType || target.username}`)
    await ensureArmor()
    await equipBestWeapon()
    bot.pvp.attack(target)
  }

  async function enterHuntMode(target) {
    if (state.mode === 'HUNT' && state.currentTargetId === target.id) return
    state.mode = 'HUNT'
    state.currentTargetId = target.id
    log(`STATE -> HUNT vs ${target.mobType || target.username}`)
    await ensureArmor()
    await equipBestWeapon()
    bot.pvp.attack(target)
  }

  function handleCreeper(creeper) {
    const owner = getOwnerEntity()
    if (!owner) return
    const dist = bot.entity.position.distanceTo(creeper.position)
    if (dist <= config.creeperEvadeRadius) {
      bot.pvp.stop()
      state.mode = 'FOLLOW'
      state.currentTargetId = null
      log('CREEPER EVADE, terug naar owner.')
      bot.pathfinder.setGoal(new GoalFollow(owner, config.followDistance + 2), true)
    } else {
      if (state.mode !== 'FOLLOW') enterFollowMode()
    }
  }

  bot.on('physicsTick', () => {
    if (!state.ownerName) return
    const owner = getOwnerEntity()
    if (!owner) {
      log('Owner not found, clearing owner.')
      clearOwner()
      return
    }
    const now = Date.now()
    const threat = findBestThreat()
    if (threat) {
      state.lastThreatTime = now
      const distOwnerThreat = owner.position.distanceTo(threat.position)
      const distBotThreat = bot.entity.position.distanceTo(threat.position)
      const isCreeper = threat.mobType && threat.mobType.includes('Creeper')
      if (isCreeper) {
        handleCreeper(threat)
        return
      }
      const ownerSafe = isOwnerSafe()
      if (distOwnerThreat <= config.priorityRadius || !ownerSafe) {
        if (state.mode !== 'COMBAT' || state.currentTargetId !== threat.id) {
          enterCombatMode(threat)
        }
      } else if (
        distOwnerThreat <= config.maxHuntDistance &&
        ownerSafe
      ) {
        if (state.mode !== 'HUNT' || state.currentTargetId !== threat.id) {
          enterHuntMode(threat)
        }
      } else {
        if (state.mode !== 'FOLLOW') {
          enterFollowMode()
        }
      }
      const distBotOwner = bot.entity.position.distanceTo(owner.position)
      if (state.mode === 'HUNT' && distBotOwner > config.maxHuntDistance + 4) {
        log('HUNT cancelled, bot too far from owner.')
        enterFollowMode()
      }
      return
    }
    if (state.mode !== 'FOLLOW' && now - state.lastThreatTime > config.resumeFollowMs) {
      log('No threats for a while → back to FOLLOW.')
      enterFollowMode()
    }
  })

  bot.on('entityHurt', (entity) => {
    if (!config.enablePvpDefense) return
    const owner = getOwnerEntity()
    if (!owner || entity !== owner) return
    const attacker = bot.nearestEntity(e =>
      e.type === 'player' &&
      e !== bot.entity &&
      e.position.distanceTo(owner.position) <= 4
    )
    if (attacker) {
      log(`Owner attacked by player ${attacker.username}, engaging PvP.`)
      state.mode = 'COMBAT'
      state.currentTargetId = attacker.id
      bot.pvp.attack(attacker)
    }
  })

  bot.on('playerCollect', (collector, item) => {
    if (!state.ownerName) return
    if (collector !== bot.entity) return
    ensureArmor()
      .then(() => equipBestWeapon())
      .catch(() => {})
  })

  bot.on('death', () => {
    log('Bot died. Waiting for respawn, then follow owner again.')
    state.currentTargetId = null
    state.mode = 'FOLLOW'
    setTimeout(() => {
      if (state.ownerName) enterFollowMode()
    }, 2000)
  })

  function setOwner(name) {
    state.ownerName = name
    log(`Owner set to ${name}`)
    enterFollowMode()
  }

  function clearOwner() {
    log('Owner cleared, stopping combat + follow.')
    state.ownerName = null
    state.currentTargetId = null
    bot.pvp.stop()
    bot.pathfinder.stop()
    state.mode = 'FOLLOW'
  }

  return {
    setOwner,
    clearOwner,
    getState: () => ({ ...state })
  }
}

module.exports = { initCombatSystem }
