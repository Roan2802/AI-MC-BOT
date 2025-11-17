/**
 * Movement Intelligence Module
 * 
 * Provides pathfinding and navigation using mineflayer-pathfinder.
 * Supports following players, moving to positions, and stopping.
 */

const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg
const { GoalFollow, GoalNear, GoalBlock } = goals

/**
 * Initialize pathfinder plugin on bot.
 * Must be called once at bot spawn.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @throws {Error} If pathfinder plugin fails to load
 */
function setupPathfinder(bot) {
  try {
    const { pathfinder } = pathfinderPkg
    bot.loadPlugin(pathfinder)
    console.log('[Movement] Pathfinder plugin loaded successfully')
  } catch (e) {
    console.error('[Movement] Failed to load pathfinder:', e.message)
    throw new Error('Pathfinder plugin load failed')
  }
}

/**
 * Follow a player continuously.
 * Bot will keep moving toward player, maintaining ~2 block distance.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {string} playerName - Username to follow
 * @throws {Error} If player not found or pathfinder unavailable
 */
function followPlayer(bot, playerName) {
  try {
    const player = bot.players[playerName]
    if (!player || !player.entity) {
      throw new Error(`Speler ${playerName} niet gevonden`)
    }
    const movements = new Movements(bot)
    try { bot.setControlState && bot.setControlState('sprint', false) } catch (e) {}
    try { bot.setControlState && bot.setControlState('jump', false) } catch (e) {}
    bot.pathfinder.setMovements(movements)
    const goal = new GoalFollow(player.entity, 2)
    bot.pathfinder.setGoal(goal)
    console.log(`[Movement] Following ${playerName}`)
  } catch (e) {
    console.error('[Movement] Follow error:', e.message)
    throw e
  }
}

/**
 * Move to a player's current position.
 * One-time movement, not continuous like followPlayer.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {string} playerName - Username to move toward
 * @throws {Error} If player not found or pathfinding fails
 */
function goToPlayer(bot, playerName) {
  try {
    const player = bot.players[playerName]
    if (!player || !player.entity) {
      throw new Error(`Speler ${playerName} niet gevonden`)
    }
    const pos = player.entity.position
    const movements = new Movements(bot)
    try { bot.setControlState && bot.setControlState('sprint', false) } catch (e) {}
    try { bot.setControlState && bot.setControlState('jump', false) } catch (e) {}
    bot.pathfinder.setMovements(movements)
    const goal = new GoalNear(pos.x, pos.y, pos.z, 2)
    bot.pathfinder.setGoal(goal)
    console.log(`[Movement] Navigating toward ${playerName}`)
  } catch (e) {
    console.error('[Movement] GoToPlayer error:', e.message)
    throw e
  }
}

/**
 * Move to an absolute position.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {object} position - Target position {x, y, z}
 * @throws {Error} If position invalid or pathfinding fails
 */
function moveToPosition(bot, position) {
  try {
    if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') {
      throw new Error('Ongeldige positie')
    }
    const movements = new Movements(bot)
    try { bot.setControlState && bot.setControlState('sprint', false) } catch (e) {}
    try { bot.setControlState && bot.setControlState('jump', false) } catch (e) {}
    bot.pathfinder.setMovements(movements)
    const goal = new GoalBlock(Math.floor(position.x), Math.floor(position.y || 64), Math.floor(position.z))
    bot.pathfinder.setGoal(goal)
    console.log(`[Movement] Moving to ${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}`)
  } catch (e) {
    console.error('[Movement] MoveToPosition error:', e.message)
    throw e
  }
}

/**
 * Stop all movement and cancel current goal.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @throws {Error} If pathfinder unavailable
 */
function stop(bot) {
  try {
    bot.pathfinder.setGoal(null)
    console.log('[Movement] Stopped')
  } catch (e) {
    console.error('[Movement] Stop error:', e.message)
    throw new Error('Kan niet stoppen')
  }
}

/**
 * Stay in place (alias for stop).
 * 
 * @param {object} bot - Mineflayer bot instance
 */
function stay(bot) {
  stop(bot)
}

module.exports = {
  setupPathfinder,
  followPlayer,
  goToPlayer,
  moveToPosition,
  stop,
  stay
}
