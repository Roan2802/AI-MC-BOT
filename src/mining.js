import { Vec3 } from 'vec3'
import logger from '../utils/logger.js'

/**
 * Scan nearby cube for blocks matching a name fragment (resourceType)
 * @param {import('mineflayer').Bot} bot
 * @param {string} resourceType
 */
export async function mineResource(bot, resourceType, opts = {}){
  const radius = opts.radius || 20
  const pos = bot.entity.position
  const candidates = []
  for (let dx = -radius; dx <= radius; dx++){
    for (let dy = -4; dy <= 4; dy++){
      for (let dz = -radius; dz <= radius; dz++){
        const p = pos.offset(dx, dy, dz)
        const b = bot.blockAt(p)
        if (!b) continue
        if (b.name && b.name.includes(resourceType)) candidates.push(b)
      }
    }
  }
  if (candidates.length === 0) throw new Error('no_blocks')
  // sort by distance
  candidates.sort((a,b)=> a.position.distanceTo(pos) - b.position.distanceTo(pos))
  const target = candidates[0]
  bot.chat(`Ga naar ${target.name} op ${target.position.x},${target.position.y},${target.position.z}`)
  // move to block and dig
  try {
    const movements = new (await import('mineflayer-pathfinder')).Movements(bot)
    const { goals } = await import('mineflayer-pathfinder')
    bot.pathfinder.setMovements(movements)
    const goal = new goals.GoalBlock(target.position.x, target.position.y, target.position.z)
    bot.pathfinder.setGoal(goal)
    // wait until near
    await waitForCondition(()=> bot.entity.position.distanceTo(target.position) < 3, 20000)
    await bot.dig(target)
    bot.chat(`Klaar met hakken van ${target.name}`)
  } catch (e){
    logger.error('mineResource error', e)
    throw e
  }
}

function waitForCondition(check, timeout){
  return new Promise((resolve, reject)=>{
    const start = Date.now()
    const iv = setInterval(()=>{
      if (check()){ clearInterval(iv); resolve(true); return }
      if (Date.now() - start > timeout){ clearInterval(iv); reject(new Error('timeout')) }
    }, 500)
  })
}

export default { mineResource }
