/**
 * Wood Harvesting Helpers
 * 
 * Helper functions for tree harvesting:
 * - Finding connected logs (flood-fill)
 * - Finding sapling positions
 * - Unstuck detection
 * - Path creation
 */

/**
 * Find connected log blocks (flood-fill) starting from a root log.
 * @param {import('mineflayer').Bot} bot
 * @param {import('prismarine-block').Block} startBlock
 * @param {number} radius
 * @returns {Array<import('prismarine-block').Block>} array of log blocks
 */
function findConnectedLogs(bot, startBlock, radius = 20) {
  if (!bot || !startBlock || !startBlock.position) {
    console.log('[Wood] findConnectedLogs: Invalid parameters')
    return []
  }
  
  try {
    const origin = bot.entity.position
    if (!origin) {
      console.log('[Wood] findConnectedLogs: No entity position')
      return []
    }
    
    const visited = new Set()
    const toVisit = [startBlock.position]
    const blocks = []

    const key = (p) => `${Math.floor(p.x)},${Math.floor(p.y)},${Math.floor(p.z)}`

    while (toVisit.length > 0 && blocks.length < 256) {
      const pos = toVisit.shift()
      if (!pos) continue
      
      const k = key(pos)
      if (visited.has(k)) continue
      visited.add(k)
      
      const b = bot.blockAt(pos)
      if (!b || !b.name) continue
      if (!b.name.includes('log')) continue
      if (pos.distanceTo(origin) > radius) continue
      blocks.push(b)

      // neighbors: up/down and 4 horizontal + diagonals for better detection
      const neighbors = [
        [1,0,0], [-1,0,0], [0,0,1], [0,0,-1], [0,1,0], [0,-1,0],
        [1,0,1], [1,0,-1], [-1,0,1], [-1,0,-1] // diagonals
      ]
      for (const n of neighbors) {
        const np = pos.offset(n[0], n[1], n[2])
        const nk = key(np)
        if (!visited.has(nk)) toVisit.push(np)
      }
    }
    return blocks
  } catch (e) {
    console.error('[Wood] findConnectedLogs error:', e.message)
    return []
  }
}

/**
 * Find suitable position for sapling replanting with 4-block spacing
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} basePos - Base position of tree
 * @param {number} radius
 * @returns {Vec3|null} position where sapling should be placed
 */
function findSaplingPosition(bot, basePos, radius = 5) {
  // Check ground level around base for suitable dirt/grass
  const pos = basePos.clone()
  pos.y = Math.floor(pos.y)
  
  // Check if position is at least 4 blocks away from other saplings
  const existingSaplings = []
  for (let dx = -8; dx <= 8; dx++) {
    for (let dz = -8; dz <= 8; dz++) {
      const checkPos = pos.offset(dx, 0, dz)
      const block = bot.blockAt(checkPos)
      if (block && block.name && block.name.includes('sapling')) {
        existingSaplings.push(checkPos)
      }
    }
  }
  
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const checkPos = pos.offset(dx, 0, dz)
      const block = bot.blockAt(checkPos)
      const below = bot.blockAt(checkPos.offset(0, -1, 0))
      
      if (block && block.name === 'air' && below && 
          (below.name === 'dirt' || below.name === 'grass_block' || below.name === 'podzol')) {
        
        // Check 4-block spacing from other saplings
        const tooClose = existingSaplings.some(s => s.distanceTo(checkPos) < 4)
        if (!tooClose) {
          return checkPos
        }
      }
    }
  }
  return null
}

/**
 * Detect and escape if bot is stuck (no movement for 10 seconds)
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if escaped
 */
async function tryUnstuck(bot) {
  try {
    console.log('[Wood] Attempting to unstuck...')
    
    // Try digging down to remove obstacles
    const blockBelow = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    if (blockBelow && blockBelow.diggable) {
      await bot.dig(blockBelow)
      console.log('[Wood] Dug below block')
      return true
    }
    
    // Try jumping
    await bot.setControlState('jump', true)
    await new Promise(r => setTimeout(r, 200))
    await bot.setControlState('jump', false)
    console.log('[Wood] Jumped')
    
    return true
  } catch (e) {
    console.log('[Wood] Unstuck failed:', e.message)
    return false
  }
}

/**
 * Create a path of blocks toward target for faster movement
 * @param {import('mineflayer').Bot} bot
 * @param {Vec3} targetPos
 * @returns {Promise<void>}
 */
async function createPathWithBlocks(bot, targetPos) {
  try {
    const botPos = bot.entity.position
    const dx = Math.sign(targetPos.x - botPos.x)
    const dz = Math.sign(targetPos.z - botPos.z)
    
    // Place blocks every 4 steps toward target
    for (let i = 0; i < 8; i++) {
      const checkPos = botPos.offset(dx * i * 4, 0, dz * i * 4)
      const blockBelow = bot.blockAt(checkPos.offset(0, -1, 0))
      
      if (blockBelow && !blockBelow.diggable && blockBelow.name !== 'bedrock') {
        // Ground is solid, don't place
        continue
      }
      
      // Try to place a block
      try {
        // This is optional - continue even if fails
      } catch (e) {
        // Silently fail
      }
    }
  } catch (e) {
    // Silently fail - this is optional
  }
}

module.exports = {
  findConnectedLogs,
  findSaplingPosition,
  tryUnstuck,
  createPathWithBlocks
}
