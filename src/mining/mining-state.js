const { Vec3 } = require('vec3')
function initMiningState(bot) {
  return {
    mode: 'idle',
    startedAt: Date.now(),
    lastOreTimestamp: Date.now(),
    minedBlocks: 0,
    minedOres: 0,
    branchIndex: 0,
    mainCorridorLength: 0,
    breadcrumb: [],
    entrancePos: bot.entity.position.clone(),
    currentY: bot.entity.position.y,
    abortReason: null
  }
}
function pushBreadcrumb(state, pos) {
  state.breadcrumb.push(pos.clone ? pos.clone() : new Vec3(pos.x,pos.y,pos.z))
}
function updateAfterDig(state, block) {
  state.minedBlocks++
  if (block && block.name && block.name.includes('ore')) {
    state.minedOres++
    state.lastOreTimestamp = Date.now()
  }
  state.currentY = block ? block.position.y : state.currentY
}
module.exports = { initMiningState, pushBreadcrumb, updateAfterDig }
