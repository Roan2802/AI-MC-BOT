/**
 * Safety helpers to check blocks and positions.
 * These are simple heuristics: not exhaustive.
 */
export function isBlockSafe(bot, block){
  if (!block) return false
  if (block.name && block.name.includes('lava')) return false
  return true
}

export function isPositionSafe(bot, pos){
  const below = bot.blockAt(pos.offset(0, -1, 0))
  if (!below) return false
  if (below.name && below.name.includes('lava')) return false
  // check drop depth
  let depth = 0
  for (let i=1;i<=6;i++){
    const b = bot.blockAt(pos.offset(0, -i, 0))
    if (!b || b.name === 'air') depth++
    else break
  }
  if (depth >= 3) return false
  return true
}

export default { isBlockSafe, isPositionSafe }
