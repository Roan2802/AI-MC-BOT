const defaultMiningConfig = {
  maxDepth: 35,
  targetYForDiamond: 12,
  branchInterval: 6,
  branchLength: 12,
  torchSpacing: 8,
  enableLighting: true,
  enableVeinExpansion: true,
  safeFallHeight: 4,
  lavaAvoidRadius: 1,
  gravelSandSupport: true,
  inventoryFullSlots: 4,
  repairThreshold: 3,
  allowedOres: ['coal','iron','copper','lapis','redstone','gold','diamond','emerald'],
  priorityOres: ['diamond','iron','redstone','lapis'],
  skipIfNoOreWithin: 120000,
  branchYStopAboveLava: true,
  maxSessionDuration: 1800000
}
function mergeMiningConfig(overrides = {}) {
  return { ...defaultMiningConfig, ...overrides }
}
module.exports = { defaultMiningConfig, mergeMiningConfig }
