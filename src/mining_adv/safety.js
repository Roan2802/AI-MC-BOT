// Mining Advanced - safety helpers
function isHazard(block) {
  if (!block) return false
  const name = block.name || ''
  return name.includes('lava') || name.includes('fire') || name.includes('campfire')
}

function scanAhead(bot, distance = 3) {
  const dir = {
    x: Math.round(Math.sin(bot.entity.yaw)),
    z: Math.round(Math.cos(bot.entity.yaw))
  }
  const origin = bot.entity.position.floored()
  const hazards = []
  for (let i = 1; i <= distance; i++) {
    const pos = origin.offset(dir.x * i, 0, dir.z * i)
    const block = bot.blockAt(pos)
    if (isHazard(block)) hazards.push(block)
  }
  return hazards
}

async function avoidHazards(bot) {
  const hazards = scanAhead(bot, 4)
  if (hazards.length === 0) return false
  bot.chat('⚠️ Hazard detected — sidestep')
  // Simple sidestep: strafe left then forward
  bot.setControlState('left', true)
  await new Promise(r => setTimeout(r, 600))
  bot.setControlState('left', false)
  bot.setControlState('forward', true)
  await new Promise(r => setTimeout(r, 800))
  bot.setControlState('forward', false)
  return true
}

module.exports = { isHazard, scanAhead, avoidHazards }
