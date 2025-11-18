/**
 * Automation Intelligence Engine
 *
 * High-level rules and scheduling for autonomous bot behavior:
 * - Detect resource depletion and trigger gathering
 * - Auto-craft tools when durability low
 * - Safe inventory management (return home when full)
 * - Night-time safety mode
 * - Task scheduling and prioritization
 */

/**
 * Resource depletion detector: checks if a resource is below threshold.
 * @param {import('mineflayer').Bot} bot
 * @param {string} resourceFragment - Name fragment (e.g., 'log', 'stone', 'coal')
 * @param {number} minCount - Minimum acceptable count (default 16)
 * @returns {{depleted: boolean, current: number}}
 */
function isResourceDepleted(bot, resourceFragment, minCount = 16) {
  const items = bot.inventory.items()
  const current = items.reduce((sum, i) => sum + (i.name && i.name.includes(resourceFragment) ? i.count : 0), 0)
  return { depleted: current < minCount, current }
}

/**
 * Tool durability checker: detect tools with low durability.
 * @param {import('mineflayer').Bot} bot
 * @param {number} durabilityThreshold - Durability % below which tool is considered "worn" (default 25)
 * @returns {Array<{name: string, durability: number, percent: number}>}
 */
function getWornTools(bot, durabilityThreshold = 25) {
  const items = bot.inventory.items()
  const worn = []
  for (const item of items) {
    if (!item.name || !item.name.includes('_') || !item.durabilityUsed) continue
    const toolKeywords = ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']
    if (!toolKeywords.some(k => item.name.includes(k))) continue
    const maxDurability = item.nbt?.value?.Enchantments?.[0]?.lvl || item.durabilityUsed + item.nbt?.value?.Unbreakable ? 1000 : 1000
    const percent = ((maxDurability - item.durabilityUsed) / maxDurability) * 100
    if (percent < durabilityThreshold) {
      worn.push({ name: item.name, durability: item.durabilityUsed, percent: Math.round(percent) })
    }
  }
  return worn
}

/**
 * Inventory fullness detector.
 * @param {import('mineflayer').Bot} bot
 * @param {number} fullnessThreshold - Percent full at which inventory is considered "full" (default 80)
 * @returns {{full: boolean, percent: number, usedSlots: number, totalSlots: number}}
 */
function getInventoryStatus(bot, fullnessThreshold = 80) {
  const items = bot.inventory.items()
  const totalSlots = bot.inventory.slots.length
  const usedSlots = items.filter(i => i).length
  const percent = (usedSlots / totalSlots) * 100
  return { full: percent >= fullnessThreshold, percent: Math.round(percent), usedSlots, totalSlots }
}

/**
 * Time-based safety check: detect day/night cycle.
 * @param {import('mineflayer').Bot} bot
 * @returns {{isNight: boolean, time: number}}
 */
function getTimeOfDay(bot) {
  // bot.time.age gives age in ticks; ~24000 ticks per day
  // Night is roughly 13000-22000 ticks (of 24000)
  const time = (bot.time.age || 0) % 24000
  const isNight = time >= 13000 && time < 22000
  return { isNight, time }
}

/**
 * Automation rules engine: evaluates conditions and suggests/triggers actions.
 */
class AutomationEngine {
  constructor(bot) {
    this.bot = bot
    this.rules = []
    this.taskQueue = []
    this.running = false
  }

  /**
   * Add an automation rule.
   * @param {Object} rule - { name, condition: (bot) => boolean, action: async (bot) => void, priority: number }
   */
  addRule(rule) {
    this.rules.push(rule)
    // Sort by priority (higher priority first)
    this.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0))
  }

  /**
   * Evaluate all rules and return triggered ones.
   * @returns {Array<Object>} array of triggered rules
   */
  evaluateRules() {
    const triggered = []
    for (const rule of this.rules) {
      try {
        if (rule.condition(this.bot)) {
          triggered.push(rule)
        }
      } catch (e) {
        console.warn(`[AutomationEngine] Rule "${rule.name}" evaluation failed:`, e.message)
      }
    }
    return triggered
  }

  /**
   * Execute triggered rules (one-shot or queue for later).
   * @param {Array<Object>} triggeredRules
   * @param {boolean} executeNow - if true, execute immediately; else queue
   * @returns {Promise<void>}
   */
  async executeRules(triggeredRules, executeNow = false) {
    if (executeNow && !this.running) {
      this.running = true
      try {
        for (const rule of triggeredRules) {
          try {
            await rule.action(this.bot)
            this.bot.chat(`[Auto] ${rule.name} completado.`)
          } catch (e) {
            this.bot.chat(`[Auto] ${rule.name} falhou: ${e.message}`)
          }
        }
      } finally {
        this.running = false
      }
    } else {
      // Queue for later
      this.taskQueue.push(...triggeredRules)
    }
  }

  /**
   * Process queued tasks one by one (call periodically).
   * @returns {Promise<number>} number of tasks completed
   */
  async processTasks() {
    if (this.running || this.taskQueue.length === 0) return 0
    this.running = true
    let completed = 0
    try {
      while (this.taskQueue.length > 0) {
        const rule = this.taskQueue.shift()
        try {
          await rule.action(this.bot)
          completed++
        } catch (e) {
          console.warn(`[AutomationEngine] Task "${rule.name}" failed:`, e.message)
        }
      }
    } finally {
      this.running = false
    }
    return completed
  }

  /**
   * Get engine status.
   * @returns {string} status summary
   */
  status() {
    const queueLen = this.taskQueue.length
    const rulesCount = this.rules.length
    return `AutomationEngine: ${rulesCount} rules, ${queueLen} queued tasks, running: ${this.running}`
  }
}

/**
 * Create a default automation engine with common rules.
 * @param {import('mineflayer').Bot} bot
 * @returns {AutomationEngine} configured engine
 */
function createDefaultEngine(bot) {
  const engine = new AutomationEngine(bot)

  // Rule 1: Resource depletion - trigger gathering
  engine.addRule({
    name: 'Low Logs → Gather Wood',
    priority: 80,
    condition: (b) => {
      const { depleted } = isResourceDepleted(b, 'log', 16)
      return depleted
    },
    action: async (b) => {
      const { harvestWood } = require('./wood/wood.js')
      b.chat('🌲 Logs uitgeput, begin houthakking...')
      await harvestWood(b, 30, 32)
    }
  })

  // Rule 2: No fuel - make charcoal/kelp blocks
  engine.addRule({
    name: 'No Fuel → Make Charcoal',
    priority: 75,
    condition: (b) => {
      const coal = isResourceDepleted(b, 'coal', 1).depleted
      const charcoal = isResourceDepleted(b, 'charcoal', 1).depleted
      const planks = isResourceDepleted(b, 'plank', 4).depleted
      const kelpBlock = isResourceDepleted(b, 'dried_kelp_block', 1).depleted
      return coal && charcoal && planks && kelpBlock
    },
    action: async (b) => {
      const { createCharcoal } = require('./smelting.js')
      b.chat('🔥 Geen brandstof, maak charcoal...')
      await createCharcoal(b, 16, 20)
    }
  })

  // Rule 3: Inventory full - return home and store
  engine.addRule({
    name: 'Full Inventory → Store Items',
    priority: 70,
    condition: (b) => {
      const { full } = getInventoryStatus(b, 85)
      return full
    },
    action: async (b) => {
      const { returnHomeAndStore } = require('./storage.js')
      b.chat('🏠 Inventory vol, ga naar huis en sla op...')
      await returnHomeAndStore(b)
    }
  })

  // Rule 4: No pickaxe - ensure tool
  engine.addRule({
    name: 'No Pickaxe → Craft Tool',
    priority: 65,
    condition: (b) => {
      const { hasPickaxe } = require('./crafting-tools.js')
      return !hasPickaxe(b)
    },
    action: async (b) => {
      const { ensureStonePickaxe } = require('./crafting-tools.js')
      b.chat('⛏️ Geen pickaxe, maak gereedschap...')
      await ensureStonePickaxe(b)
    }
  })

  // Rule 5: Night time - seek safety or stay indoors (TODO: implement shelter logic)
  engine.addRule({
    name: 'Nighttime → Safety Mode',
    priority: 60,
    condition: (b) => {
      const { isNight } = getTimeOfDay(b)
      return isNight
    },
    action: async (b) => {
      b.chat('🌙 Het is nacht, activeer veiligheid...')
      // TODO: teleport to home or find shelter
    }
  })

  // Rule 6: Low ore - trigger mining
  engine.addRule({
    name: 'No Ore → Mine Ores',
    priority: 55,
    condition: (b) => {
      const { depleted } = isResourceDepleted(b, 'ore', 0)
      return depleted
    },
    action: async (b) => {
      const { mineOres } = require('./mining.js')
      b.chat('⛏️ Geen ertsen in inventory, begin te minen...')
      await mineOres(b, 32, 20)
    }
  })

  return engine
}

module.exports = { isResourceDepleted, getWornTools, getInventoryStatus, getTimeOfDay, AutomationEngine, createDefaultEngine }
