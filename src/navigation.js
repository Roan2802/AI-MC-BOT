/**
 * Navigation Module
 * 
 * Higher-level navigation with retry logic, timeouts, and safety checks.
 * Wraps pathfinder with error handling and optional safety validation.
 */

import pathfinderPkg from 'mineflayer-pathfinder'
const { Movements, goals } = pathfinderPkg
import { isPositionSafe } from '../utils/safety.js'

/**
 * Navigate to a position with retry and timeout logic.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {object} position - Target {x, y, z}
 * @param {object} [opts={}] - Options {timeout: 30000, maxRetries: 3, checkSafety: true}
 * @returns {Promise<boolean>} True if reached, false if timeout
 * @throws {Error} If position invalid
 */
export async function goTo(bot, position, opts = {}) {
  const timeout = opts.timeout || 30000
  const maxRetries = opts.maxRetries || 3
  const checkSafety = opts.checkSafety !== false

  if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') {
    throw new Error('Ongeldige positie')
  }

  // Safety check if enabled
  if (checkSafety) {
    const pos = { x: Math.floor(position.x), y: Math.floor(position.y), z: Math.floor(position.z) }
    if (!isPositionSafe(bot, pos)) {
      throw new Error('Positie onveilig (lava/val)')
    }
  }

  let lastError = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const movements = new Movements(bot)
      try { bot.setControlState && bot.setControlState('sprint', false) } catch (e) {}
      try { bot.setControlState && bot.setControlState('jump', false) } catch (e) {}
      bot.pathfinder.setMovements(movements)
      const goal = new goals.GoalBlock(position.x, position.y, position.z)
      bot.pathfinder.setGoal(goal)

      // Wait with timeout
      const startTime = Date.now()
      return await new Promise((resolve, reject) => {
        const checkInterval = setInterval(() => {
          const dist = bot.entity.position.distanceTo(position)
          if (dist < 2) {
            clearInterval(checkInterval)
            bot.pathfinder.setGoal(null)
            resolve(true)
          }
          if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval)
            bot.pathfinder.setGoal(null)
            resolve(false)
          }
        }, 500)
      })
    } catch (e) {
      lastError = e
      console.warn(`[Navigation] Attempt ${attempt + 1} failed:`, e.message)
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }

  throw lastError || new Error('Navigation failed after retries')
}

/**
 * Select the safest target from a list of positions.
 * Filters by safety checks and distance.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {array} targets - Array of positions [{x, y, z}, ...]
 * @returns {object|null} Safest target or null if none safe
 */
export function selectSafeTarget(bot, targets) {
  if (!targets || targets.length === 0) return null

  const safeCandidates = targets.filter(t => {
    try {
      return isPositionSafe(bot, { x: Math.floor(t.x), y: Math.floor(t.y), z: Math.floor(t.z) })
    } catch (e) {
      return false
    }
  })

  if (safeCandidates.length === 0) return null

  // Return closest safe target
  const botPos = bot.entity.position
  safeCandidates.sort((a, b) => {
    const distA = botPos.distanceTo(a)
    const distB = botPos.distanceTo(b)
    return distA - distB
  })

  return safeCandidates[0]
}

export default { goTo, selectSafeTarget }
