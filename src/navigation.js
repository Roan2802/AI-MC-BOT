import logger from '../utils/logger.js'

/**
 * Navigation helpers around pathfinding and safety.
 */
export async function goTo(bot, position, opts = {}){
  const movements = new (await import('mineflayer-pathfinder')).Movements(bot)
  const { goals } = await import('mineflayer-pathfinder')
  bot.pathfinder.setMovements(movements)
  const goal = new goals.GoalBlock(position.x, position.y, position.z)
  bot.pathfinder.setGoal(goal)
}

export function selectSafeTarget(bot, targets){
  // simple filter to reject positions that are unsafe (requires utils/safety)
  // TODO: integrate utils/safety checks
  if (!targets || targets.length === 0) return null
  return targets[0]
}

export default { goTo, selectSafeTarget }
