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
 * Follow persists until explicitly stopped with stop() or stay().
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
    bot.pathfinder.setGoal(goal, true) // true = dynamic goal that updates continuously
    
    // Store follow state to maintain persistence
    bot._followingPlayer = playerName
    
    // Set up continuous follow monitor (updates every 500ms)
    if (bot._followInterval) {
      clearInterval(bot._followInterval)
    }
    
    bot._followInterval = setInterval(() => {
      if (!bot._followingPlayer) {
        clearInterval(bot._followInterval)
        bot._followInterval = null
        return
      }
      
      const currentPlayer = bot.players[bot._followingPlayer]
      if (!currentPlayer || !currentPlayer.entity) {
        console.log(`[Movement] Lost sight of ${bot._followingPlayer}, stopping follow`)
        bot._followingPlayer = null
        clearInterval(bot._followInterval)
        bot._followInterval = null
        return
      }
      
      // Re-apply goal to ensure continuous following
      const dist = bot.entity.position.distanceTo(currentPlayer.entity.position)
      if (dist > 3) {
        const movements = new Movements(bot)
        bot.pathfinder.setMovements(movements)
        const goal = new GoalFollow(currentPlayer.entity, 2)
        bot.pathfinder.setGoal(goal, true)
      }
    }, 500)
    
    console.log(`[Movement] Following ${playerName} (continuous mode)`)
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
 * Also stops continuous follow mode if active.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @throws {Error} If pathfinder unavailable
 */
function stop(bot) {
  try {
    // Stop continuous follow if active
    if (bot._followingPlayer) {
      console.log(`[Movement] Stopping follow of ${bot._followingPlayer}`)
      bot._followingPlayer = null
    }
    if (bot._followInterval) {
      clearInterval(bot._followInterval)
      bot._followInterval = null
    }
    
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

/**
 * Initialize global stuck detector
 * Monitors bot position and breaks blocking blocks if stuck for 10+ seconds
 * ONLY ACTIVE DURING TASKS (mining, wood, combat, etc.)
 * 
 * @param {object} bot - Mineflayer bot instance
 */
function initStuckDetector(bot) {
  let lastPosition = bot.entity.position.clone()
  let lastMoveTime = Date.now()
  const STUCK_TIMEOUT = 15000 // 15 seconds, less aggressive
  const STUCK_DISTANCE = 0.5 // Movement threshold
  
  // Task tracking - stuck detector only works during active tasks
  bot.isDoingTask = false
  
  console.log('[Movement] Stuck detector initialized (task-based)')
  
  // Check every 2 seconds
  const stuckCheckInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) {
        clearInterval(stuckCheckInterval)
        return
      }
      
      // ONLY check if bot is actively doing a task
      if (!bot.isDoingTask) {
        // Reset timers when idle
        lastPosition = bot.entity.position.clone()
        lastMoveTime = Date.now()
        return
      }
      
      const currentPos = bot.entity.position
      const distance = lastPosition.distanceTo(currentPos)
      const timeSinceMove = Date.now() - lastMoveTime
      
      if (distance > STUCK_DISTANCE) {
        // Bot moved, update position
        lastPosition = currentPos.clone()
        lastMoveTime = Date.now()
      } else if (timeSinceMove > STUCK_TIMEOUT) {
        // Skip clearing if bot is actively pathfinding or digging
        try {
          if ((bot.pathfinder && typeof bot.pathfinder.isMoving === 'function' && bot.pathfinder.isMoving()) || bot._isDigging) {
            return
          }
        } catch (e) {}

        // Bot is stuck DURING TASK! Break blocking blocks
        console.log('[Movement] ⚠️ Bot stuck during task! Breaking blocking blocks...')
        bot.chat('⚠️ Stuck! Clearing path...')
        
        // Break 16 blocks around bot: 8 at foot level + 8 at head level
        // NOT above or below (no digging down or breaking ceiling)
        const blockingPositions = [
          // Foot level (8 blocks around horizontally)
          currentPos.offset(1, 0, 0).floored(),   // East
          currentPos.offset(-1, 0, 0).floored(),  // West
          currentPos.offset(0, 0, 1).floored(),   // South
          currentPos.offset(0, 0, -1).floored(),  // North
          currentPos.offset(1, 0, 1).floored(),   // Southeast
          currentPos.offset(1, 0, -1).floored(),  // Northeast
          currentPos.offset(-1, 0, 1).floored(),  // Southwest
          currentPos.offset(-1, 0, -1).floored(), // Northwest
          
          // Head/Eye level (8 blocks around horizontally, 1 block up)
          currentPos.offset(1, 1, 0).floored(),   // East head
          currentPos.offset(-1, 1, 0).floored(),  // West head
          currentPos.offset(0, 1, 1).floored(),   // South head
          currentPos.offset(0, 1, -1).floored(),  // North head
          currentPos.offset(1, 1, 1).floored(),   // Southeast head
          currentPos.offset(1, 1, -1).floored(),  // Northeast head
          currentPos.offset(-1, 1, 1).floored(),  // Southwest head
          currentPos.offset(-1, 1, -1).floored()  // Northwest head
        ]
        
        // Break blocks asynchronously
        ;(async () => {
          for (const pos of blockingPositions) {
            try {
              const block = bot.blockAt(pos)
              if (block && block.diggable && block.name !== 'air') {
                console.log(`[Movement] Breaking blocking ${block.name} at ${pos.x}, ${pos.y}, ${pos.z}`)
                await bot.dig(block)
                await new Promise(r => setTimeout(r, 200))
              }
            } catch (e) {
              // Ignore dig errors
            }
          }
          
          // Reset stuck timer after clearing
          lastPosition = bot.entity.position.clone()
          lastMoveTime = Date.now()
          console.log('[Movement] Path cleared, resuming task...')
        })()
      }
    } catch (e) {
      console.error('[Movement] Stuck detector error:', e.message)
    }
  }, 2000) // Check every 2 seconds
  
  // Store interval for cleanup
  bot._stuckCheckInterval = stuckCheckInterval
}

module.exports = {
  setupPathfinder,
  followPlayer,
  goToPlayer,
  moveToPosition,
  stop,
  stay,
  initStuckDetector
}
