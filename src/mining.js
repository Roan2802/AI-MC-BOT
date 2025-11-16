/**
 * Mining Module
 * 
 * Locates and harvests resources within a radius.
 * Scans blocks, navigates to closest match, and digs.
 */

import pathfinderPkg from 'mineflayer-pathfinder'
const { Movements, goals } = pathfinderPkg

/**
 * Scan for blocks matching a resource type and harvest the closest one.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @param {string} resourceType - Block name fragment (e.g., 'oak_log', 'stone')
 * @param {number} [radius=20] - Scan radius in blocks
 * @returns {Promise<void>}
 * @throws {Error} If no matching blocks found or mining fails
 */
export async function mineResource(bot, resourceType, radius = 20) {
  try {
    const pos = bot.entity.position
    const candidates = []

    // Scan cube for matching blocks
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const p = pos.offset(dx, dy, dz)
          const block = bot.blockAt(p)
          if (block && block.name && block.name.includes(resourceType)) {
            candidates.push(block)
          }
        }
      }
    }

    if (candidates.length === 0) {
      throw new Error(`Geen blokken gevonden: ${resourceType}`)
    }

    // Sort by distance, pick closest
    candidates.sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))
    const target = candidates[0]

    console.log(`[Mining] Found ${target.name} at ${target.position.x}, ${target.position.y}, ${target.position.z}`)
    bot.chat(`Ga naar ${target.name}`)

    // Navigate to target
    const movements = new Movements(bot)
    bot.pathfinder.setMovements(movements)
    const goal = new goals.GoalBlock(target.position.x, target.position.y, target.position.z)
    bot.pathfinder.setGoal(goal)

    // Wait for arrival
    await waitForCondition(() => bot.entity.position.distanceTo(target.position) < 3, 30000)

    // Dig target
    await bot.dig(target)
    console.log(`[Mining] Mined ${target.name}`)
    bot.chat(`Klaar met hakken van ${target.name}`)
  } catch (e) {
    console.error('[Mining] Error:', e.message)
    throw new Error(`Mining error: ${e.message}`)
  }
}

/**
 * Wait for a condition to be true with timeout.
 * 
 * @param {function} check - Function returning boolean
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>}
 * @throws {Error} If timeout exceeded
 */
function waitForCondition(check, timeout) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const interval = setInterval(() => {
      if (check()) {
        clearInterval(interval)
        resolve(true)
        return
      }
      if (Date.now() - start > timeout) {
        clearInterval(interval)
        reject(new Error('Timeout wachten op conditie'))
      }
    }, 500)
  })
}

export default { mineResource }
