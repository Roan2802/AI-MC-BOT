import fs from 'fs'
import path from 'path'
import { Movements, goals } from 'mineflayer-pathfinder'
const { GoalFollow, GoalBlock, GoalNear } = goals

function formatPos(p){ return `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}` }

const managers = new WeakMap()

/**
 * Attach movement intelligence to a bot instance and store per-bot manager.
 * @param {import('mineflayer').Bot} bot
 * @param {object} opts
 */
export function attachMovement(bot, opts = {}) {
  const options = Object.assign({ followRange: 3, gpsInterval: 5000, stuckTimeout: 8000, allowTeleportCommands: false }, opts)
  const logsDir = path.resolve(process.cwd(), 'logs')
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true })
  const gpsFile = path.join(logsDir, 'gps.jsonl')

  let followTarget = null
  let followGoal = null
  let gpsTimer = null
  let stuckTimer = null
  let lastDist = null
  let stuckCounter = 0
  const movements = new Movements(bot)

  function startGPS() {
    if (gpsTimer) return
    gpsTimer = setInterval(()=>{
      const pos = bot.entity.position
      const entry = {
        ts: new Date().toISOString(),
        bot: { x: pos.x, y: pos.y, z: pos.z },
        following: null
      }
      if (followTarget && followTarget.username) {
        const p = bot.players[followTarget.username] && bot.players[followTarget.username].entity
        entry.following = { username: followTarget.username, pos: p ? { x: p.position.x, y: p.position.y, z: p.position.z } : null }
      }
      fs.appendFile(gpsFile, JSON.stringify(entry) + '\n', ()=>{})
    }, options.gpsInterval)
  }
  function stopGPS(){ if(gpsTimer){clearInterval(gpsTimer); gpsTimer=null} }

  function startFollow(playerEntity) {
    if (!playerEntity) return
    followTarget = playerEntity
    followGoal = new GoalFollow(playerEntity, options.followRange, 1)
    bot.pathfinder.setMovements(movements)
    bot.pathfinder.setGoal(followGoal, true)
    startGPS()
    startStuckWatcher()
    bot.chat(`Now following ${playerEntity.username}`)
  }

  function stopFollow() {
    followTarget = null
    followGoal = null
    try { bot.pathfinder.setGoal(null) } catch(e){}
    stopGPS()
    stopStuckWatcher()
    bot.chat('Stopped following.')
  }

  function startStuckWatcher() {
    lastDist = null
    stuckCounter = 0
    stopStuckWatcher()
    stuckTimer = setInterval(()=>{
      if(!followTarget) return
      const playerEnt = bot.players[followTarget.username] && bot.players[followTarget.username].entity
      if(!playerEnt) return
      const dist = bot.entity.position.distanceTo(playerEnt.position)
      if (lastDist !== null && dist >= lastDist - 0.2) {
        stuckCounter++
      } else {
        stuckCounter = 0
      }
      lastDist = dist
      if (stuckCounter * (options.gpsInterval/1000) >= options.stuckTimeout/1000) {
        if (options.allowTeleportCommands) {
          bot.chat(`/tp ${bot.username} ${followTarget.username}`)
        } else {
          bot.chat(`I seem to be stuck following ${followTarget.username}. Please /tp me or move to me.`)
        }
        stuckCounter = 0
      }
    }, options.gpsInterval)
  }
  function stopStuckWatcher(){ if(stuckTimer){clearInterval(stuckTimer); stuckTimer=null} }

  // basic parkour/jump behaviour: attempt small jumps for simple gaps
  bot.on('physicsTick', ()=>{
    if (!followTarget) return
    const playerEnt = bot.players[followTarget.username] && bot.players[followTarget.username].entity
    if (!playerEnt) return
    const pos = bot.entity.position.clone().floor()
    const dx = Math.sign(playerEnt.position.x - pos.x)
    const dz = Math.sign(playerEnt.position.z - pos.z)
    const blockFront = bot.blockAt(pos.offset(dx, 0, dz))
    const blockBelowFront = bot.blockAt(pos.offset(dx, -1, dz))
    if (blockFront && blockFront.name === 'air' && blockBelowFront && blockBelowFront.name === 'air') {
      bot.setControlState('jump', true)
      setTimeout(()=>bot.setControlState('jump', false), 300)
    }
  })

  // safety: avoid lava & deep drops by reacting to path steps
  bot.on('path_step', (step) => {
    const p = step.position
    const blockHere = bot.blockAt(p)
    const blockBelow = bot.blockAt(p.offset(0, -1, 0))
    if (blockHere && blockHere.name && blockHere.name.includes('lava')) {
      bot.chat('Detected lava in path, stopping and recalculating.')
      try { bot.pathfinder.setGoal(null) } catch(e){}
    }
    if (blockBelow && blockBelow.name === 'air') {
      let depth = 0
      for (let i=1;i<=6;i++){
        const b = bot.blockAt(p.offset(0, -i, 0))
        if (!b || b.name === 'air') depth++
        else break
      }
      if (depth >= 3) {
        bot.chat('Detected deep drop ahead, stopping and recalculating.')
        try { bot.pathfinder.setGoal(null) } catch(e){}
      }
    }
  })

  // chat command hooks
  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    const parts = message.split(' ')
    const cmd = parts[0].toLowerCase()
    if (cmd === '!follow') {
      const targetName = parts[1] || username
      const player = bot.players[targetName] && bot.players[targetName].entity
      if (!player) {
        bot.chat(`I can't find player ${targetName}`)
        return
      }
      startFollow(player)
    } else if (cmd === '!stop') {
      stopFollow()
    }
  })

  return {
    startFollow,
    stopFollow,
    options
  }
}

/** Create and store manager for a bot. */
function createManager(bot, opts){
  if (managers.has(bot)) return managers.get(bot)
  const mgr = attachMovement(bot, opts)
  managers.set(bot, mgr)
  return mgr
}

/** Public API wrappers that other modules can call. */
export function followPlayer(bot, playerName){
  const mgr = createManager(bot)
  const player = bot.players[playerName] && bot.players[playerName].entity
  if (!player) throw new Error(`Player ${playerName} not found`)
  return mgr.startFollow(player)
}

export function goToPlayer(bot, playerName){
  const player = bot.players[playerName] && bot.players[playerName].entity
  if (!player) throw new Error(`Player ${playerName} not found`)
  const movements = new Movements(bot)
  bot.pathfinder.setMovements(movements)
  const goal = new GoalNear(player.position.x, player.position.y, player.position.z, 2)
  bot.pathfinder.setGoal(goal)
}

export function stay(bot){
  if (managers.has(bot)) {
    const m = managers.get(bot)
    m.stopFollow()
  }
  try { bot.pathfinder.setGoal(null) } catch(e){}
}

export function moveToPosition(bot, position){
  const movements = new Movements(bot)
  bot.pathfinder.setMovements(movements)
  const goal = new GoalBlock(position.x, position.y, position.z)
  bot.pathfinder.setGoal(goal)
}

export default attachMovement
