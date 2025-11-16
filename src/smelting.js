/**
 * Smelting automation
 *
 * Detect a furnace nearby, load fuel and ores from inventory, start smelting,
 * and collect the results when finished. Best-effort implementation.
 */

import { Vec3 } from 'vec3'
import { ensureFurnace, ensureFuel } from './crafting.js'

/**
 * Find nearest furnace block within radius.
 * @param {import('mineflayer').Bot} bot
 * @param {number} radius
 * @returns {Block|null}
 */
function findFurnace(bot, radius = 20) {
  const pos = bot.entity.position
  let best = null
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const b = bot.blockAt(pos.offset(dx, dy, dz))
        if (!b || !b.name) continue
        if (b.name.includes('furnace')) {
          if (!best || b.position.distanceTo(pos) < best.position.distanceTo(pos)) best = b
        }
      }
    }
  }
  return best
}

/**
 * Smelt ores found in inventory. Tries to use coal first, then planks as fuel.
 * @param {import('mineflayer').Bot} bot
 * @param {number} [radius=20]
 * @returns {Promise<{smelted: number, failed: number}>}
 */
export async function smeltOres(bot, radius = 20) {
  let furnaceBlock = findFurnace(bot, radius)
  if (!furnaceBlock) {
    bot.chat('Geen oven gevonden — probeer te craften/plaatsen...')
    const ok = await ensureFurnace(bot)
    if (!ok) {
      bot.chat('Kon geen oven maken of plaatsen')
      throw new Error('no_furnace')
    }
    // re-scan for placed oven
    furnaceBlock = findFurnace(bot, radius)
    if (!furnaceBlock) {
      bot.chat('Oven geplaatst maar kon blok niet vinden, annuleer')
      throw new Error('no_furnace_after_place')
    }
  }

  // collect ores from inventory
  const inv = bot.inventory.items()
  const oreItems = inv.filter(i => i.name && (i.name.includes('iron_ore') || i.name.includes('coal') === false && i.name.includes('ore')))
  // include generic ore words
  const ores = inv.filter(i => i.name && (i.name.includes('ore') || i.name === 'coal'))
  const fuelCandidates = inv.filter(i => i.name && (i.name === 'coal' || i.name.includes('plank')))

  if (ores.length === 0) {
    bot.chat('Geen ruwe ertsen in inventory om te smelten')
    return { smelted: 0, failed: 0 }
  }

  // open furnace container
  let furnace = null
  try {
    furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock) : bot.openContainer(furnaceBlock))
  } catch (e) {
    // fallback to openContainer
    furnace = await bot.openContainer(furnaceBlock)
  }

  let smelted = 0
  let failed = 0

  // Move fuel to fuel slot if available
  let fuel = fuelCandidates[0]
  if (!fuel) {
    bot.chat('Geen brandstof beschikbaar — probeer brandstof te maken (planks) ...')
    const ok = await ensureFuel(bot)
    if (ok) {
      const inv2 = bot.inventory.items()
      const newCandidates = inv2.filter(i => i.name && (i.name === 'coal' || i.name.includes('plank')))
      fuel = newCandidates[0]
    }
    if (!fuel) {
      bot.chat('Geen brandstof beschikbaar voor oven (coal/planks)')
    }
  }

  try {
    // deposit fuel if present
    if (fuel) {
      try { await furnace.deposit(fuel.type, null, fuel.count) } catch (_) {}
    }

    // deposit ores
    for (const ore of ores) {
      try {
        await furnace.deposit(ore.type, null, ore.count)
      } catch (e) {
        failed += ore.count
      }
    }

    // wait and poll for results (best-effort)
    const start = Date.now()
    const TIMEOUT = 120000 // 2 minutes
    while (Date.now() - start < TIMEOUT) {
      // if furnace has output (slot 2) collect
      try {
        const output = furnace.containerItems()[2]
        if (output && output.count > 0) {
          await furnace.takeOutput(2, output.count)
          smelted += output.count
        }
      } catch (e) {
        // ignore
      }
      // stop if no burning and no input
      const hasInput = furnace.containerItems().some(it => it && it.type && it.type !== 0)
      if (!hasInput) break
      await new Promise(r => setTimeout(r, 2000))
    }
  } finally {
    try { furnace.close() } catch (_) {}
  }

  bot.chat(`Smelten klaar: ${smelted} items, failed: ${failed}`)
  return { smelted, failed }
}

/**
 * Create dried kelp by smelting raw kelp in a furnace.
 * @param {import('mineflayer').Bot} bot
 * @param {number} kelpToUse
 * @param {number} [radius=20]
 * @returns {Promise<number>} number of dried_kelp collected
 */
export async function createDriedKelp(bot, kelpToUse = 16, radius = 20) {
  let furnaceBlock = findFurnace(bot, radius)
  if (!furnaceBlock) {
    bot.chat('Geen oven gevonden — probeer te craften/plaatsen...')
    const ok = await ensureFurnace(bot)
    if (!ok) {
      bot.chat('Kon geen oven maken of plaatsen')
      throw new Error('no_furnace')
    }
    furnaceBlock = findFurnace(bot, radius)
    if (!furnaceBlock) {
      bot.chat('Oven geplaatst maar kon blok niet vinden, annuleer')
      throw new Error('no_furnace_after_place')
    }
  }

  let furnace = null
  try {
    furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock) : bot.openContainer(furnaceBlock))
  } catch (e) {
    furnace = await bot.openContainer(furnaceBlock)
  }

  // ensure fuel available
  await ensureFuel(bot)
  const inv = bot.inventory.items()
  const fuel = inv.find(i => i.name && (i.name === 'coal' || i.name === 'charcoal' || i.name.includes('plank') || i.name === 'dried_kelp_block' || i.name === 'dried_kelp'))
  const kelps = inv.filter(i => i.name && i.name === 'kelp')
  if (kelps.length === 0) {
    bot.chat('Geen kelp in inventory om te drogen')
    try { furnace.close() } catch (_) {}
    return 0
  }

  // deposit fuel
  if (fuel) {
    try { await furnace.deposit(fuel.type, null, Math.min(fuel.count, Math.max(1, Math.floor(kelpToUse / 4)))) } catch (_) {}
  }

  // deposit kelp
  let dep = 0
  for (const k of kelps) {
    if (dep >= kelpToUse) break
    try {
      const take = Math.min(k.count, kelpToUse - dep)
      await furnace.deposit(k.type, null, take)
      dep += take
    } catch (e) {}
  }

  let collected = 0
  const start = Date.now()
  const TIMEOUT = 120000
  while (Date.now() - start < TIMEOUT) {
    try {
      const output = furnace.containerItems()[2]
      if (output && output.count > 0) {
        await furnace.takeOutput(2, output.count)
        collected += output.count
      }
    } catch (e) {}
    const hasInput = furnace.containerItems().some(it => it && it.type && it.type !== 0)
    if (!hasInput) break
    await new Promise(r => setTimeout(r, 1500))
  }

  try { furnace.close() } catch (_) {}
  bot.chat(`Gedroogde kelp verzameld: ${collected}`)
  return collected
}

/**
 * Craft dried_kelp_block from dried_kelp items (9 -> 1 block), if possible.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<boolean>} true if crafted
 */
export async function createDriedKelpBlock(bot) {
  try {
    const recipes = bot.recipesAll ? bot.recipesAll('dried_kelp_block') : bot.recipesFor('dried_kelp_block', null, 1)
    if (!recipes || recipes.length === 0) return false
    // craft as many as possible based on dried_kelp count
    const inv = bot.inventory.items()
    const dried = inv.find(i => i.name && i.name === 'dried_kelp')
    if (!dried) return false
    const count = Math.floor(dried.count / 9)
    if (count <= 0) return false
    await bot.craft(recipes[0], count)
    return true
  } catch (e) {
    console.warn('[Smelting] createDriedKelpBlock failed:', e && e.message)
    return false
  }
}

/**
 * Job queue for bulk fuel production and smelting tasks.
 * Tracks pending jobs, current state, and provides pause/resume.
 */
export class FuelJobQueue {
  constructor() {
    this.jobs = [] // array of { type: 'charcoal'|'kelp'|'kelpblock'|'smelt', amount, status }
    this.running = false
    this.currentJob = null
  }

  /**
   * Add a fuel production job to the queue.
   * @param {string} type - 'charcoal', 'kelp' (dry), 'kelpblock' (craft from dried), 'smelt' (ore)
   * @param {number} amount - quantity
   */
  addJob(type, amount = 1) {
    this.jobs.push({ type, amount, status: 'pending', result: 0 })
  }

  /**
   * Execute all pending jobs sequentially (best-effort).
   * @param {import('mineflayer').Bot} bot
   * @returns {Promise<Array>} array of job results
   */
  async runAll(bot) {
    if (this.running) {
      bot.chat('Job queue is al aan het draaien')
      return []
    }

    this.running = true
    const results = []
    try {
      while (this.jobs.length > 0 && this.running) {
        const job = this.jobs.shift()
        this.currentJob = job
        bot.chat(`[Fuel Queue] ${job.type} starten (${job.amount})...`)
        try {
          let result = 0
          if (job.type === 'charcoal') {
            result = await createCharcoal(bot, job.amount, 20)
          } else if (job.type === 'kelp') {
            result = await createDriedKelp(bot, job.amount, 20)
          } else if (job.type === 'kelpblock') {
            const crafted = await createDriedKelpBlock(bot)
            result = crafted ? job.amount : 0
          } else if (job.type === 'smelt') {
            const res = await smeltOres(bot, 20)
            result = res.smelted
          }
          job.status = 'done'
          job.result = result
          results.push(job)
          bot.chat(`[Fuel Queue] ${job.type} klaar: ${result}`)
        } catch (e) {
          job.status = 'failed'
          results.push(job)
          bot.chat(`[Fuel Queue] ${job.type} mislukt: ${e && e.message}`)
        }
        this.currentJob = null
      }
    } finally {
      this.running = false
    }
    return results
  }

  /**
   * Stop current execution (graceful).
   */
  stop() {
    this.running = false
  }

  /**
   * Get queue status summary.
   * @returns {string} status string
   */
  status() {
    const pending = this.jobs.filter(j => j.status === 'pending').length
    const done = this.jobs.filter(j => j.status === 'done').length
    const failed = this.jobs.filter(j => j.status === 'failed').length
    return `Jobs: ${pending} pending, ${done} done, ${failed} failed${this.currentJob ? ` | Actief: ${this.currentJob.type}` : ''}`
  }
}

// Global queue instance
let globalFuelQueue = null

/**
 * Get or create the global fuel job queue.
 * @returns {FuelJobQueue}
 */
export function getJobQueue() {
  if (!globalFuelQueue) globalFuelQueue = new FuelJobQueue()
  return globalFuelQueue
}

/**
 * Build a smart fuel production plan based on current inventory.
 * @param {import('mineflayer').Bot} bot
 * @returns {FuelJobQueue} pre-populated queue
 */
export function buildSmartFuelPlan(bot) {
  const queue = new FuelJobQueue()
  const items = bot.inventory.items()
  const logCount = items.reduce((sum, i) => sum + (i.name && i.name.includes('log') ? i.count : 0), 0)
  const kelpCount = items.reduce((sum, i) => sum + (i.name === 'kelp' ? i.count : 0), 0)
  const driedKelpCount = items.reduce((sum, i) => sum + (i.name === 'dried_kelp' ? i.count : 0), 0)
  const oreCount = items.reduce((sum, i) => sum + (i.name && i.name.includes('ore') ? i.count : 0), 0)

  // Smart prioritization: kelp -> charcoal -> ore smelting
  if (kelpCount > 0) {
    const batches = Math.ceil(kelpCount / 32)
    for (let i = 0; i < batches; i++) {
      queue.addJob('kelp', Math.min(32, kelpCount - i * 32))
    }
    if (driedKelpCount > 8) {
      queue.addJob('kelpblock', 1)
    }
  } else if (logCount > 0) {
    const batches = Math.ceil(logCount / 16)
    for (let i = 0; i < batches; i++) {
      queue.addJob('charcoal', Math.min(16, logCount - i * 16))
    }
  }

  if (oreCount > 0) {
    queue.addJob('smelt', 1)
  }

  return queue
}

export default { smeltOres, createCharcoal, createDriedKelp, createDriedKelpBlock, FuelJobQueue, getJobQueue, buildSmartFuelPlan }


/**
 * Create charcoal by smelting logs in a furnace. Uses planks as initial fuel if needed.
 * @param {import('mineflayer').Bot} bot
 * @param {number} logsToUse
 * @param {number} [radius=20]
 * @returns {Promise<number>} number of charcoal collected
 */
export async function createCharcoal(bot, logsToUse = 8, radius = 20) {
  const furnaceBlock = findFurnace(bot, radius)
  if (!furnaceBlock) {
    bot.chat('Geen oven gevonden — probeer te craften/plaatsen...')
    const ok = await ensureFurnace(bot)
    if (!ok) {
      bot.chat('Kon geen oven maken of plaatsen')
      throw new Error('no_furnace')
    }
  }

  let furnace = null
  try {
    furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock || findFurnace(bot, radius)) : bot.openContainer(furnaceBlock || findFurnace(bot, radius)))
  } catch (e) {
    furnace = await bot.openContainer(furnaceBlock || findFurnace(bot, radius))
  }

  // Ensure some initial fuel is available (planks or coal)
  await ensureFuel(bot)
  const inv = bot.inventory.items()
  const fuel = inv.find(i => i.name && (i.name === 'coal' || i.name === 'charcoal' || i.name.includes('plank') || i.name === 'dried_kelp_block' || i.name === 'dried_kelp'))
  const logs = inv.filter(i => i.name && i.name.includes('log'))
  if (logs.length === 0) {
    bot.chat('Geen logs in inventory om charcoal van te maken')
    furnace.close()
    return 0
  }

  let toUse = logsToUse
  // deposit fuel
  if (fuel) {
    try { await furnace.deposit(fuel.type, null, Math.min(fuel.count, Math.max(1, Math.floor(toUse / 2)))) } catch (_) {}
  }

  // deposit logs
  let deposited = 0
  for (const l of logs) {
    if (deposited >= toUse) break
    try {
      const take = Math.min(l.count, toUse - deposited)
      await furnace.deposit(l.type, null, take)
      deposited += take
    } catch (e) {
      // ignore
    }
  }

  let charcoalCollected = 0
  const start = Date.now()
  const TIMEOUT = 120000
  while (Date.now() - start < TIMEOUT) {
    try {
      const output = furnace.containerItems()[2]
      if (output && output.count > 0) {
        // take output
        await furnace.takeOutput(2, output.count)
        charcoalCollected += output.count
      }
    } catch (e) {
      // ignore
    }
    // stop if no input remains
    const hasInput = furnace.containerItems().some(it => it && it.type && it.type !== 0)
    if (!hasInput) break
    await new Promise(r => setTimeout(r, 1500))
  }

  try { furnace.close() } catch (_) {}
  bot.chat(`Charcoal gemaakt: ${charcoalCollected}`)
  return charcoalCollected
}
