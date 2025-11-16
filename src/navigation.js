import logger from '../utils/logger.js'

/**
 * Navigation helpers around pathfinding and safety.
 */
export async function goTo(bot, position, opts = {}){
  const pfModule = await import('mineflayer-pathfinder')
  const pf = pfModule.default || pfModule
  const Movements = pf.Movements
  const goals = pf.goals
  const movements = new Movements(bot)
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
