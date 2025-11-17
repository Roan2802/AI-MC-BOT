/**
 * Simple mining helper using mineflayer
 */

async function mineNearestBlock(bot, blockName, radius = 20) {
  const pos = bot.entity.position
  let nearest = null
  let nearestDist = Infinity

  // Scan for blocks
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const p = pos.offset(dx, dy, dz)
        const block = bot.blockAt(p)
        if (!block) continue
        if (block.name.includes(blockName)) {
          const dist = pos.distanceTo(block.position)
          if (dist < nearestDist) {
            nearestDist = dist
            nearest = block
          }
        }
      }
    }
  }

  if (!nearest) {
    throw new Error(`No ${blockName} found within ${radius} blocks`)
  }

  console.log(`[Mining] Found ${nearest.name} at distance ${nearestDist.toFixed(1)}`)

  // Move to block
  const movements = new (await import('mineflayer-pathfinder')).Movements(bot)
  const pfPkg = await import('mineflayer-pathfinder')
  const pf = pfPkg.default || pfPkg
  const goals = pf.goals
  bot.pathfinder.setMovements(movements)
  const goal = new goals.GoalBlock(nearest.position.x, nearest.position.y, nearest.position.z)
  bot.pathfinder.setGoal(goal)

  // Wait until close
  return new Promise((resolve, reject) => {
    const maxWait = 30000
    const startTime = Date.now()
    const checkInterval = setInterval(() => {
      const dist = bot.entity.position.distanceTo(nearest.position)
      if (dist < 4) {
        clearInterval(checkInterval)
        bot.pathfinder.setGoal(null)
        // Dig the block
        bot.dig(nearest)
          .then(() => {
            console.log(`[Mining] Successfully mined ${nearest.name}`)
            resolve()
          })
          .catch((e) => {
            clearInterval(checkInterval)
            reject(e)
          })
      }
      if (Date.now() - startTime > maxWait) {
        clearInterval(checkInterval)
        reject(new Error('Mining timeout'))
      }
    }, 500)
  })
}

module.exports = { mineNearestBlock };
