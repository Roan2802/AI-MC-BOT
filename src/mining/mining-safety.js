function isBlockSafeToMine(bot, block, config) {
  if (!block) return false
  // Lava proximity simple check
  const around = [ [1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0],[0,1,0] ]
  for (const o of around) {
    const b = bot.blockAt(block.position.offset(o[0],o[1],o[2]))
    if (b && b.name && b.name.includes('lava')) return false
  }
  // Fall risk: if block below after mining would expose > safeFallHeight
  const below = bot.blockAt(block.position.offset(0,-1,0))
  if (!below || below.name === 'air') {
    // probe downward
    let depth = 0
    let cursor = block.position.offset(0,-1,0)
    while (depth <= config.safeFallHeight) {
      const test = bot.blockAt(cursor)
      if (test && test.name !== 'air') break
      depth++
      cursor = cursor.offset(0,-1,0)
    }
    if (depth > config.safeFallHeight) return false
  }
  return true
}
module.exports = { isBlockSafeToMine }
