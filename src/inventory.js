/**
 * Inventory manager helpers
 *
 * Simple utilities to count items and attempt to gather resources by
 * using the mining module (best-effort). This is intentionally small
 * and will call `mineResource` for basic gathering tasks.
 */

import { mineResource } from './mining.js'

/**
 * Count items in inventory that contain nameFragment.
 * @param {import('mineflayer').Bot} bot
 * @param {string} nameFragment
 * @returns {number}
 */
export function countItem(bot, nameFragment) {
  const items = bot.inventory.items()
  return items.reduce((sum, it) => {
    if (it && it.name && it.name.includes(nameFragment)) return sum + it.count
    return sum
  }, 0)
}

/**
 * Ensure resource is available in inventory by attempting to mine it if missing.
 * Best-effort: calls `mineResource` with given radius until required amount collected or attempts exhausted.
 * @param {import('mineflayer').Bot} bot
 * @param {string} resourceFragment
 * @param {number} amount
 * @param {object} [opts] - { radius, attempts }
 * @returns {Promise<boolean>} true if required amount is present
 */
export async function ensureResource(bot, resourceFragment, amount = 1, opts = {}) {
  const radius = opts.radius || 20
  const attempts = opts.attempts || 2

  let have = countItem(bot, resourceFragment)
  if (have >= amount) return true

  for (let i = 0; i < attempts; i++) {
    try {
      await mineResource(bot, resourceFragment, radius)
    } catch (e) {
      // mining may fail; continue attempts
    }
    have = countItem(bot, resourceFragment)
    if (have >= amount) return true
  }

  return have >= amount
}

export default { countItem, ensureResource }
