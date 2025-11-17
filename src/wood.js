/**
 * Wood harvesting helpers
 *
 * Simple routine to harvest nearby trees by repeatedly finding log blocks
 * and digging them. Uses existing mining and crafting helpers to ensure
 * appropriate tools exist.
 */

const { mineResource } = require('./mining.js')
const { ensureToolFor } = require('./crafting.js')

/**
 * Find connected log blocks (simple flood-fill) starting from a root log.
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @returns {Array<import('prismarine-block').Block>} array of log blocks
 */
function findConnectedLogs(bot, startBlock, radius = 20) {
  const origin = bot.entity.position
  const visited = new Set()
  const toVisit = [startBlock.position]
  const blocks = []

  const key = (p) => `${p.x},${p.y},${p.z}`

  while (toVisit.length > 0 && blocks.length < 256) {
    const pos = toVisit.shift()
    const k = key(pos)
    if (visited.has(k)) continue
    visited.add(k)
    const b = bot.blockAt(pos)
    if (!b || !b.name) continue
    if (!b.name.includes('log')) continue
    if (pos.distanceTo(origin) > radius) continue
    blocks.push(b)

    // neighbors: up/down and 4 horizontal
    const neighbors = [ [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,1,0], [0,-1,0] ]
    for (const n of neighbors) {
      const np = pos.offset(n[0], n[1], n[2])
      const nk = key(np)
      if (!visited.has(nk)) toVisit.push(np)
    }
  }
  return blocks
}

/**
 * Harvest wood blocks within a radius by felling whole trees when found.
 * Attempts to find a nearby log, discover its connected cluster and
 * mine logs top-down to avoid dropping leaves prematurely.
 * @param {import('mineflayer').Bot} bot
 * @param {number} [radius=20]
 * @param {number} [maxBlocks=32]
 * @returns {Promise<number>} Number of blocks successfully harvested
 */
async function harvestWood(bot, radius = 20, maxBlocks = 32) {
  // ensure we have an axe
  await ensureToolFor(bot, 'wood')

  let collected = 0

  // find nearest log block
  const origin = bot.entity.position
  const logBlock = bot.findBlock({
    matching: b => b && b.name && b.name.includes('log'),
    maxDistance: radius
  })
  if (!logBlock) {
    // fallback to mining single logs
    try {
      await mineResource(bot, 'log', radius)
      return 1
    } catch (e) {
      return 0
    }
  }

  const cluster = findConnectedLogs(bot, logBlock, radius)
  if (!cluster || cluster.length === 0) return 0

  // Sort by y descending so we mine from top to bottom
  cluster.sort((a,b) => b.position.y - a.position.y)

  for (const b of cluster) {
    if (collected >= maxBlocks) break
    try {
      await mineResource(bot, `${b.name}`, 6)
      collected++
      await new Promise(r => setTimeout(r, 250))
    } catch (e) {
      // ignore and continue
    }
  }

  return collected
}

module.exports = { harvestWood }
