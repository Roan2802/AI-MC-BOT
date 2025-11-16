import pathfinderPkg from 'mineflayer-pathfinder'
const { Movements, goals } = pathfinderPkg
const { GoalFollow, GoalNear } = goals

/**
 * Simple movement helper using mineflayer-pathfinder
 */

export function setupPathfinder(bot) {
  const { pathfinder } = pathfinderPkg
  bot.loadPlugin(pathfinder)
  console.log('[Movement] Pathfinder plugin loaded')
}

export function followPlayer(bot, playerName) {
  try {
    const player = bot.players[playerName]
    if (!player || !player.entity) {
      throw new Error(`Player ${playerName} not found`)
    }
    const movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)
    const goal = new GoalFollow(player.entity, 2)
    bot.pathfinder.setGoal(goal)
    console.log(`[Movement] Following ${playerName}`)
  } catch (e) {
    console.error('[Movement] Follow error:', e.message)
    throw e
  }
}

export function goToPlayer(bot, playerName) {
  try {
    const player = bot.players[playerName]
    if (!player || !player.entity) {
      throw new Error(`Player ${playerName} not found`)
    }
    const movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)
    const goal = new GoalNear(player.entity.position.x, player.entity.position.y, player.entity.position.z, 2)
    bot.pathfinder.setGoal(goal)
    console.log(`[Movement] Going to ${playerName}`)
  } catch (e) {
    console.error('[Movement] GoTo error:', e.message)
    throw e
  }
}

export function stop(bot) {
  try {
    bot.pathfinder.setGoal(null)
    console.log('[Movement] Stopped')
  } catch (e) {
    console.error('[Movement] Stop error:', e.message)
  }
}

export default { setupPathfinder, followPlayer, goToPlayer, stop }
