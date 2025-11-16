/**
 * Safety helpers to check blocks and positions.
 * These are simple heuristics: not exhaustive.
 */
export function isBlockSafe(bot, block){
  if (!block) return false
  const name = block.name || ''
  if (name.includes('lava')) return false
  if (name.includes('fire')) return false
  if (name.includes('campfire')) return false
  if (name === 'magma_block') return false
  return true
}

export function isPositionSafe(bot, pos){
  const below = bot.blockAt({x: pos.x, y: pos.y - 1, z: pos.z})
  if (!below) return false
  const bname = below && below.name ? below.name : ''
  if (bname.includes('lava')) return false
  if (bname === 'magma_block') return false

  // check for nearby lava or fire
  if (isLavaNearby(bot, pos, 2)) return false
  if (isFireNearby(bot, pos, 2)) return false

  // check drop depth (air blocks below)
  let depth = 0
  for (let i = 1; i <= 6; i++) {
    const b = bot.blockAt({x: pos.x, y: pos.y - i, z: pos.z})
    if (!b || b.name === 'air') depth++
    else break
  }
  if (depth >= 3) return false
  return true
}

export function isLavaNearby(bot, pos, radius = 3) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const b = bot.blockAt({x: pos.x + dx, y: pos.y + dy, z: pos.z + dz})
        if (b && b.name && b.name.includes('lava')) return true
      }
    }
  }
  return false
}

export function isFireNearby(bot, pos, radius = 2) {
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const b = bot.blockAt({x: pos.x + dx, y: pos.y + dy, z: pos.z + dz})
        if (b && b.name) {
          const n = b.name
          if (n.includes('fire') || n === 'campfire' || n === 'lava') return true
        }
      }
    }
  }
  return false
}

export function isDeepDrop(bot, pos, threshold = 4) {
  let depth = 0
  for (let i = 1; i <= 10; i++) {
    const b = bot.blockAt({x: pos.x, y: pos.y - i, z: pos.z})
    if (!b || b.name === 'air') depth++
    else break
  }
  return depth >= threshold
}

export function findNearbySafePosition(bot, startPos, searchRadius = 6) {
  const origin = { x: Math.floor(startPos.x), y: Math.floor(startPos.y), z: Math.floor(startPos.z) }
  for (let r = 1; r <= searchRadius; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dy = -1; dy <= 2; dy++) {
          const candidate = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz }
          try {
            if (isPositionSafe(bot, candidate)) return candidate
          } catch (e) {
            // ignore
          }
        }
      }
    }
  }
  return null
}

export default { isBlockSafe, isPositionSafe }
