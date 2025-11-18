/**
 * Movement Intelligence Module
 * 
 * Provides pathfinding and navigation using mineflayer-pathfinder.
 * Supports following players, moving to positions, and stopping.
 */

const pathfinderPkg = require('mineflayer-pathfinder')
const { Movements, goals } = pathfinderPkg
const { GoalFollow, GoalNear, GoalBlock } = goals

// Global protected block registry: blocks we never dig in stuck recovery.
// Includes utility/workstation/storage/light/interaction blocks and terrain we avoid scarring.
const PROTECTED_BLOCKS = new Set([
  'crafting_table',
  'dirt',
  'grass_block',
  // Storage & containers
  'chest','trapped_chest','barrel','shulker_box','ender_chest',
  // Workstations
  'furnace','blast_furnace','smoker','anvil','brewing_stand','enchanting_table','cartography_table','smithing_table','stonecutter','loom','fletching_table','grindstone',
  // Utility / interaction
  'campfire','soul_campfire','ladder','lever','button','bell',
  // Lighting
  'torch','wall_torch','soul_torch','soul_wall_torch',
  // Doors & trapdoors
  'oak_door','spruce_door','birch_door','jungle_door','acacia_door','dark_oak_door','mangrove_door','cherry_door','bamboo_door','crimson_door','warped_door',
  'oak_trapdoor','spruce_trapdoor','birch_trapdoor','jungle_trapdoor','acacia_trapdoor','dark_oak_trapdoor','mangrove_trapdoor','cherry_trapdoor','bamboo_trapdoor','crimson_trapdoor','warped_trapdoor',
  // Signs (standing & wall variants may share names depending on version)
  'oak_sign','spruce_sign','birch_sign','jungle_sign','acacia_sign','dark_oak_sign','mangrove_sign','cherry_sign','bamboo_sign','crimson_sign','warped_sign'
])

function isProtectedBlockName(name) {
  if (!name) return false
  // Any sapling variant
  if (name.includes('sapling')) return true
  return PROTECTED_BLOCKS.has(name)
}

// Helper: aggressive leaf-digging movements to shorten paths through foliage
function createLeafDigMovements(bot) {
  const m = new Movements(bot)
  m.canDig = true
  m.allow1by1towers = false
  m.scafoldingBlocks = []
  try {
    const leaves = [
      'oak_leaves','spruce_leaves','birch_leaves','jungle_leaves','acacia_leaves','dark_oak_leaves',
      'mangrove_leaves','cherry_leaves','azalea_leaves','flowering_azalea_leaves'
    ]
    for (const name of leaves) {
      const blk = bot.registry?.blocksByName?.[name]
      if (blk && m.blocksCantBreak) {
        m.blocksCantBreak.delete(blk.id)
      }
    }
  } catch (e) {
    console.log('[Movement] Leaf movement setup error:', e.message)
  }
  return m
}

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
    const movements = createLeafDigMovements(bot)
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
        const movements = createLeafDigMovements(bot)
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
    const movements = createLeafDigMovements(bot)
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
    const movements = createLeafDigMovements(bot)
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
  const STUCK_TIMEOUT = 8000 // Soft stuck threshold (was 12s) quicker response
  const HARD_STUCK_TIMEOUT = 15000 // Hard stuck override (was 20s)
  const FAST_JUMP_STUCK_TIMEOUT = 5000 // Jump-stuck threshold (was 6000ms)
  const STUCK_DISTANCE = 0.5 // Movement threshold
  // Cooldowns to avoid spammy nudges/clears
  let lastMicroNudgeTime = 0
  let lastHardClearTime = 0
  const MICRO_NUDGE_COOLDOWN = 4000
  const HARD_CLEAR_COOLDOWN = 8000
  let hardClearInProgress = false
  let microNudgeInProgress = false
  
  // Task tracking - stuck detector only works during active tasks
  bot.isDoingTask = false
  
  console.log('[Movement] Stuck detector initialized (task-based)')
  
  // Track underwater time for drowning prevention
  let underwaterStartTime = null
  const MAX_UNDERWATER_TIME = 3000 // 3 seconds max underwater during tasks
  
  // Check every 2 seconds
  const stuckCheckInterval = setInterval(() => {
    try {
      if (!bot || !bot.entity) {
        clearInterval(stuckCheckInterval)
        return
      }
      
      // CRITICAL: Drowning prevention during active tasks
      if (bot.isDoingTask && isInWater(bot)) {
        if (!underwaterStartTime) {
          underwaterStartTime = Date.now()
          console.log('[Movement] ⚠️ Underwater during task - monitoring...')
        } else {
          const underwaterDuration = Date.now() - underwaterStartTime
          if (underwaterDuration > MAX_UNDERWATER_TIME) {
            console.log('[Movement] 🚨 DROWNING RISK! Emergency water escape...')
            bot.chat('🚨 Water! Escaping...')
            // Force immediate water escape
            ;(async () => {
              try {
                // Cancel current goal
                try { bot.pathfinder.setGoal(null) } catch (e) {}
                // Stop all movement
                const controls = ['forward','back','left','right','sprint']
                for (const c of controls) { try { bot.setControlState(c, false) } catch (e) {} }
                
                const target = findNearestDryLand(bot, 12)
                if (target) {
                  const movements = createLeafDigMovements(bot)
                  movements.canDig = false
                  movements.allow1by1towers = false
                  bot.pathfinder.setMovements(movements)
                  const goal = new goals.GoalNear(target.x, target.y, target.z, 1)
                  await bot.pathfinder.goto(goal)
                  console.log('[Movement] ✅ Escaped water, resuming task')
                } else {
                  // No dry land found, swim up aggressively
                  bot.setControlState('jump', true)
                  bot.setControlState('forward', true)
                  await new Promise(r => setTimeout(r, 2000))
                  bot.setControlState('jump', false)
                  bot.setControlState('forward', false)
                }
                underwaterStartTime = null
              } catch (e) {
                console.log('[Movement] Water escape error:', e.message)
                underwaterStartTime = null
              }
            })()
            return
          }
        }
      } else {
        // Not underwater or not doing task - reset timer
        if (underwaterStartTime) {
          console.log('[Movement] ✅ Out of water')
          underwaterStartTime = null
        }
      }
      
      // ONLY check if bot is actively doing a task
      if (!bot.isDoingTask) {
        // Reset timers when idle
        lastPosition = bot.entity.position.clone()
        lastMoveTime = Date.now()

        // Idle water escape: if bot is in water and not following anyone, swim to nearest dry land
        // This prevents drowning or floating when no tasks are active.
        try {
          if (!bot._followingPlayer && isInWater(bot)) {
            const target = findNearestDryLand(bot, 8)
            if (target) {
              const movements = createLeafDigMovements(bot)
              movements.canDig = false
              bot.pathfinder.setMovements(movements)
              const goal = new goals.GoalNear(target.x, target.y, target.z, 1)
              bot.pathfinder.setGoal(goal)
              // Small forward push once on land
              setTimeout(() => {
                if (!isInWater(bot)) {
                  bot.setControlState('forward', true)
                  setTimeout(() => bot.setControlState('forward', false), 300)
                }
              }, 1200)
            }
          }
        } catch (e) {
          // Ignore water recovery errors silently
        }
        return
      }
      
      const currentPos = bot.entity.position

      // If we are actively digging, treat that as progress and skip stuck logic.
      // This prevents micro-nudges or hard clears interrupting a dig.
      if (bot._isDigging) {
        lastPosition = currentPos.clone()
        lastMoveTime = Date.now()
        return
      }
      const distance = lastPosition.distanceTo(currentPos)
      const timeSinceMove = Date.now() - lastMoveTime
      
      if (distance > STUCK_DISTANCE) {
        // Bot moved, update position
        lastPosition = currentPos.clone()
        lastMoveTime = Date.now()
      } else if (timeSinceMove > STUCK_TIMEOUT) {
        // Determine if pathfinder thinks it's still moving or we are digging
        let movingOrDigging = false
          try {
            // Only consider pathfinder movement; digging already short-circuited above.
            movingOrDigging = (bot.pathfinder && typeof bot.pathfinder.isMoving === 'function' && bot.pathfinder.isMoving())
          } catch (e) {}

        if (movingOrDigging && timeSinceMove < HARD_STUCK_TIMEOUT) {
          // Soft stuck: apply a deterministic backward micro-nudge (no randomness)
          const now = Date.now()
          if (now - lastMicroNudgeTime < MICRO_NUDGE_COOLDOWN) return
          if (microNudgeInProgress) return
          lastMicroNudgeTime = now
          console.log('[Movement] ⚠️ Soft stuck detected (no progress). Applying backward micro-nudge...')
          try {
            microNudgeInProgress = true
            // Backward step + small jump to clear ledges, always moving back to avoid entering leaves ahead
            bot.setControlState('jump', true)
            setTimeout(() => bot.setControlState('jump', false), 280)
            bot.setControlState('back', true)
            setTimeout(() => bot.setControlState('back', false), 400)
            setTimeout(() => { microNudgeInProgress = false; lastPosition = bot.entity.position.clone(); lastMoveTime = Date.now() }, 450)
          } catch (e) {}
          return
        }

        // Hard stuck: break surrounding blocks regardless of pathfinder state
        const now = Date.now()
        if (now - lastHardClearTime < HARD_CLEAR_COOLDOWN) return
        if (hardClearInProgress) return
        lastHardClearTime = now
        hardClearInProgress = true
        console.log('[Movement] 🛑 Hard stuck! Clearing surrounding 1-block ring (16 lateral blocks)...')
        bot.chat('🛑 Hard stuck! Clearing path...')
        
        // Break 16 blocks around bot: 8 at foot level + 8 at head level
        // NOT above or below (no digging down or breaking ceiling)
        const blockingPositions = [
          // Foot level ring (8)
          currentPos.offset(1, 0, 0).floored(),
          currentPos.offset(-1, 0, 0).floored(),
          currentPos.offset(0, 0, 1).floored(),
          currentPos.offset(0, 0, -1).floored(),
          currentPos.offset(1, 0, 1).floored(),
          currentPos.offset(1, 0, -1).floored(),
          currentPos.offset(-1, 0, 1).floored(),
          currentPos.offset(-1, 0, -1).floored(),
          // Head level ring (8) – no blocks below feet or above head
          currentPos.offset(1, 1, 0).floored(),
          currentPos.offset(-1, 1, 0).floored(),
          currentPos.offset(0, 1, 1).floored(),
          currentPos.offset(0, 1, -1).floored(),
          currentPos.offset(1, 1, 1).floored(),
          currentPos.offset(1, 1, -1).floored(),
          currentPos.offset(-1, 1, 1).floored(),
          currentPos.offset(-1, 1, -1).floored()
        ]
        
        // Break blocks asynchronously (skip fragile/valuable blocks)
        ;(async () => {
          try {
            for (const pos of blockingPositions) {
              try {
                const block = bot.blockAt(pos)
                const name = block && block.name || ''
                // Extend protected set: saplings, crafting table, dirt (avoid terrain scarring)
                const isProtected = isProtectedBlockName(name)
                if (block && block.diggable && name !== 'air' && !isProtected) {
                  console.log(`[Movement] Breaking blocking ${block.name} at ${pos.x}, ${pos.y}, ${pos.z}`)
                  await bot.dig(block)
                  await new Promise(r => setTimeout(r, 160))
                }
              } catch (e) {/* ignore individual dig errors */}
            }
          } finally {
            // Reset stuck timer after clearing
            lastPosition = bot.entity.position.clone()
            lastMoveTime = Date.now()
            hardClearInProgress = false
            console.log('[Movement] Path cleared, resuming task...')
          }
        })()
      } else if (timeSinceMove > FAST_JUMP_STUCK_TIMEOUT) { // Fast jump-stuck (5s) handling
        // Skip if currently digging (already handled above)
        if (bot._isDigging) return
        // Detect small vertical oscillation (jump attempts) without horizontal movement
        try {
          if ((bot.pathfinder && typeof bot.pathfinder.isMoving === 'function' && bot.pathfinder.isMoving())) {
            return
          }
        } catch (e) {}

        const feetBlock = bot.blockAt(currentPos.floored())
        const headBlock = bot.blockAt(currentPos.offset(0, 1, 0).floored())
        // If head block is a leaf/log or any diggable non-air, or front block blocks movement, clear a small set quickly
        const forwardDir = bot.entity.yaw != null ? {
          x: Math.round(Math.sin(bot.entity.yaw)),
          z: Math.round(Math.cos(bot.entity.yaw))
        } : { x: 0, z: 1 }
        const frontPos = currentPos.offset(forwardDir.x, 0, forwardDir.z).floored()
        const frontHeadPos = currentPos.offset(forwardDir.x, 1, forwardDir.z).floored()
        const frontBlock = bot.blockAt(frontPos)
        const frontHeadBlock = bot.blockAt(frontHeadPos)

        const isProtected = n => (n && isProtectedBlockName(n.name))
        const shouldClearHead = headBlock && headBlock.name !== 'air' && headBlock.diggable && !isProtected(headBlock)
        const shouldClearFront = frontBlock && frontBlock.name !== 'air' && frontBlock.diggable && !isProtected(frontBlock)
        const shouldClearFrontHead = frontHeadBlock && frontHeadBlock.name !== 'air' && frontHeadBlock.diggable && !isProtected(frontHeadBlock)

        if (shouldClearHead || shouldClearFront || shouldClearFrontHead) {
          console.log('[Movement] Fast jump-stuck detected (6s no move). Clearing immediate obstruction...')
          bot.chat('⚠️ Vast (jump) — maak snel vrij...')
          ;(async () => {
            const targets = []
            if (shouldClearHead) targets.push(headBlock)
            if (shouldClearFront) targets.push(frontBlock)
            if (shouldClearFrontHead) targets.push(frontHeadBlock)
            for (const blk of targets) {
              try {
                await bot.dig(blk)
                await new Promise(r => setTimeout(r, 150))
              } catch (e) {}
            }
            lastPosition = bot.entity.position.clone()
            lastMoveTime = Date.now()
            console.log('[Movement] Fast obstruction cleared.')
          })()
        }
      }
    } catch (e) {
      console.error('[Movement] Stuck detector error:', e.message)
    }
  }, 2000) // Check every 2 seconds
  
  // Store interval for cleanup
  bot._stuckCheckInterval = stuckCheckInterval
}

// --- Water helpers (duplicated here for idle recovery) ---
function isInWater(bot) {
  try {
    const feet = bot.blockAt(bot.entity.position.floored())
    const head = bot.blockAt(bot.entity.position.offset(0, 1, 0).floored())
    const waterNames = ['water', 'flowing_water']
    return (feet && waterNames.includes(feet.name)) || (head && waterNames.includes(head.name))
  } catch (e) { return false }
}

function findNearestDryLand(bot, maxRadius = 6) {
  const origin = bot.entity.position.floored()
  let best = null, bestDist = Infinity
  for (let r = 1; r <= maxRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const pos = origin.offset(dx, dy, dz)
          const block = bot.blockAt(pos)
          const above = bot.blockAt(pos.offset(0, 1, 0))
          if (!block || !above) continue
          if (block.name === 'air' || block.name.includes('water')) continue
          if (above.name !== 'air') continue
          const dist = origin.distanceTo(pos)
          if (dist < bestDist) { bestDist = dist; best = pos }
        }
      }
    }
    if (best) break
  }
  return best
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
