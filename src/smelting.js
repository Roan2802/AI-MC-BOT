// Smelting and fuel utilities (CommonJS)

class FuelJobQueue {
  constructor() {
    this.jobs = []
    this.running = false
    this.currentJob = null
  }

  addJob(type, amount = 1) {
    this.jobs.push({ type, amount, status: 'pending', result: 0 })
  }

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

  status() {
    const pending = this.jobs.filter(j => j.status === 'pending').length
    const done = this.jobs.filter(j => j.status === 'done').length
    const failed = this.jobs.filter(j => j.status === 'failed').length
    return `Jobs: ${pending} pending, ${done} done, ${failed} failed${this.currentJob ? ` | Actief: ${this.currentJob.type}` : ''}`
  }
}

// Global queue instance
let globalFuelQueue = null
function getJobQueue() {
  if (!globalFuelQueue) globalFuelQueue = new FuelJobQueue()
  return globalFuelQueue
}

function buildSmartFuelPlan(bot) {
  const queue = new FuelJobQueue()
  const items = bot.inventory?.items?.() || []
  const logCount = items.reduce((sum, i) => sum + (i.name && i.name.includes('log') ? i.count : 0), 0)
  const kelpCount = items.reduce((sum, i) => sum + (i.name === 'kelp' ? i.count : 0), 0)
  const driedKelpCount = items.reduce((sum, i) => sum + (i.name === 'dried_kelp' ? i.count : 0), 0)
  const oreCount = items.reduce((sum, i) => sum + (i.name && (i.name.includes('ore') || i.name.startsWith('raw_')) ? i.count : 0), 0)

  if (kelpCount > 0) {
    const batches = Math.ceil(kelpCount / 32)
    for (let i = 0; i < batches; i++) {
      queue.addJob('kelp', Math.min(32, kelpCount - i * 32))
    }
    if (driedKelpCount > 8) queue.addJob('kelpblock', 1)
  } else if (logCount > 0) {
    const batches = Math.ceil(logCount / 16)
    for (let i = 0; i < batches; i++) queue.addJob('charcoal', Math.min(16, logCount - i * 16))
  }

  if (oreCount > 0) queue.addJob('smelt', 1)
  return queue
}

async function createDriedKelp(bot, kelpToUse = 16, radius = 20) {
  const furnaceBlock = await ensureFurnaceOrFind(bot, radius)
  if (!furnaceBlock) throw new Error('no_furnace')

  let furnace
  try {
    furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock) : bot.openContainer(furnaceBlock))
  } catch (_) {
    furnace = await bot.openContainer(furnaceBlock)
  }

  await ensureFuel(bot)
  const inv = bot.inventory.items()
  const fuel = inv.find(i => i.name && (i.name === 'coal' || i.name === 'charcoal' || i.name.includes('plank') || i.name === 'dried_kelp_block' || i.name === 'dried_kelp'))
  const kelps = inv.filter(i => i.name === 'kelp')
  if (kelps.length === 0) {
    try { furnace.close() } catch (_) {}
    bot.chat('Geen kelp in inventory om te drogen')
    return 0
  }

  if (fuel) {
    try { await furnace.deposit(fuel.type, null, Math.min(fuel.count, Math.max(1, Math.floor(kelpToUse / 4)))) } catch (_) {}
  }

  let dep = 0
  for (const k of kelps) {
    if (dep >= kelpToUse) break
    try {
      const take = Math.min(k.count, kelpToUse - dep)
      await furnace.deposit(k.type, null, take)
      dep += take
    } catch (_) {}
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
    } catch (_) {}
    const hasInput = furnace.containerItems().some(it => it && it.type && it.type !== 0)
    if (!hasInput) break
    await new Promise(r => setTimeout(r, 1500))
  }

  try { furnace.close() } catch (_) {}
  bot.chat(`Gedroogde kelp verzameld: ${collected}`)
  return collected
}

async function createDriedKelpBlock(bot) {
  try {
    const recipes = bot.recipesAll ? bot.recipesAll('dried_kelp_block') : bot.recipesFor('dried_kelp_block', null, 1)
    if (!recipes || recipes.length === 0) return false
    const inv = bot.inventory.items()
    const dried = inv.find(i => i.name === 'dried_kelp')
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

async function createCharcoal(bot, logsToUse = 8, radius = 20) {
  const furnaceBlock = await ensureFurnaceOrFind(bot, radius)
  if (!furnaceBlock) throw new Error('no_furnace')

  let furnace
  try {
    furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock) : bot.openContainer(furnaceBlock))
  } catch (_) {
    furnace = await bot.openContainer(furnaceBlock)
  }

  await ensureFuel(bot)
  const inv = bot.inventory.items()
  const fuel = inv.find(i => i.name && (i.name === 'coal' || i.name === 'charcoal' || i.name.includes('plank') || i.name === 'dried_kelp_block' || i.name === 'dried_kelp'))
  const logs = inv.filter(i => i.name && i.name.includes('log'))
  if (logs.length === 0) {
    try { furnace.close() } catch (_) {}
    bot.chat('Geen logs in inventory om charcoal van te maken')
    return 0
  }

  if (fuel) {
    try { await furnace.deposit(fuel.type, null, Math.min(fuel.count, Math.max(1, Math.floor(logsToUse / 2)))) } catch (_) {}
  }

  let deposited = 0
  for (const l of logs) {
    if (deposited >= logsToUse) break
    try {
      const take = Math.min(l.count, logsToUse - deposited)
      await furnace.deposit(l.type, null, take)
      deposited += take
    } catch (_) {}
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
    } catch (_) {}
    const hasInput = furnace.containerItems().some(it => it && it.type && it.type !== 0)
    if (!hasInput) break
    await new Promise(r => setTimeout(r, 1500))
  }

  try { furnace.close() } catch (_) {}
  bot.chat(`Charcoal gemaakt: ${collected}`)
  return collected
}

async function smeltOres(bot, radius = 20) {
  const furnaceBlock = await ensureFurnaceOrFind(bot, radius)
  if (!furnaceBlock) throw new Error('no_furnace')

  console.log('[Smelting] Opening furnace...')
  let furnace
  try {
    furnace = await (bot.openFurnace ? bot.openFurnace(furnaceBlock) : bot.openContainer(furnaceBlock))
  } catch (_) {
    furnace = await bot.openContainer(furnaceBlock)
  }

  const inv = bot.inventory.items()
  const ores = inv.filter(i => i.name && (i.name.includes('ore') || i.name.startsWith('raw_')))
  if (ores.length === 0) {
    try { furnace.close() } catch (_) {}
    bot.chat('Geen ertsen gevonden om te smelten')
    return { smelted: 0, failed: 0 }
  }

  // Deposit fuel first (planks, coal, charcoal, etc.)
  const fuel = inv.find(i => i.name && (i.name === 'coal' || i.name === 'charcoal' || i.name.includes('planks') || i.name === 'dried_kelp_block'))
  if (fuel) {
    const fuelNeeded = Math.ceil(ores.reduce((s, o) => s + o.count, 0) / 8) // Planks smelt ~1.5 items each
    const fuelAmount = Math.min(fuel.count, Math.max(1, fuelNeeded))
    console.log(`[Smelting] Adding ${fuelAmount} ${fuel.name} as fuel`)
    try { 
      await furnace.putFuel(fuel.type, null, fuelAmount)
      await new Promise(r => setTimeout(r, 300))
    } catch(e) { 
      console.log('[Smelting] Fuel deposit error:', e.message) 
    }
  } else {
    console.log('[Smelting] WARNING: No fuel found!')
  }

  // Deposit ores
  let totalOres = 0
  for (const o of ores) {
    try { 
      console.log(`[Smelting] Adding ${o.count} ${o.name} to furnace`)
      await furnace.putInput(o.type, null, o.count)
      totalOres += o.count
      await new Promise(r => setTimeout(r, 200))
    } catch(e) { 
      console.log('[Smelting] Ore deposit error:', e.message) 
    }
  }

  bot.chat(`🔥 Smelting ${totalOres} ores, wachten...`)
  
  let smelted = 0
  const start = Date.now()
  const TIMEOUT = 180000
  let lastOutput = 0
  
  while (Date.now() - start < TIMEOUT) {
    try {
      const output = furnace.outputItem()
      if (output && output.count > lastOutput) {
        console.log(`[Smelting] Output: ${output.count} ${output.name}`)
        lastOutput = output.count
      }
      
      if (output && output.count > 0) {
        await furnace.takeOutput()
        smelted += output.count
        lastOutput = 0
        console.log(`[Smelting] Collected ${smelted} items so far`)
      }
    } catch(e) { 
      console.log('[Smelting] Output check error:', e.message) 
    }
    
    // Check if furnace still has items
    const input = furnace.inputItem()
    const fuelItem = furnace.fuelItem()
    const hasInput = input && input.count > 0
    const hasFuel = fuelItem && fuelItem.count > 0
    
    if (!hasInput) {
      console.log('[Smelting] No more input, finishing up...')
      await new Promise(r => setTimeout(r, 2000)) // Wait for last items
      break
    }
    
    if (!hasFuel && hasInput) {
      bot.chat('⚠️ Fuel op! Kan niet verder smelten')
      break
    }
    
    await new Promise(r => setTimeout(r, 2000))
  }

  // Final collection
  try {
    const output = furnace.outputItem()
    if (output && output.count > 0) {
      await furnace.takeOutput()
      smelted += output.count
    }
  } catch(_) {}

  try { furnace.close() } catch (_) {}
  bot.chat(`✅ Smelten klaar: ${smelted} items`)
  return { smelted, failed: 0 }
}

// Helpers
function findFurnace(bot, radius = 20) {
  try {
    if (typeof bot.findBlock === 'function') {
      const mcData = bot.mcData || null
      const furnaceIds = []
      if (mcData?.blocksByName?.furnace) furnaceIds.push(mcData.blocksByName.furnace.id)
      if (mcData?.blocksByName?.blast_furnace) furnaceIds.push(mcData.blocksByName.blast_furnace.id)
      return bot.findBlock({ matching: furnaceIds, maxDistance: radius })
    }
  } catch (_) {}

  const pos = bot.entity?.position || { x: 0, y: 0, z: 0 }
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const p = { x: Math.floor(pos.x + dx), y: Math.floor(pos.y + dy), z: Math.floor(pos.z + dz) }
        const b = bot.blockAt?.(p)
        if (b && (b.name === 'furnace' || b.name === 'blast_furnace')) return b
      }
    }
  }
  return null
}

async function ensureFurnace(bot) {
  try {
    const inv = bot.inventory.items()
    const have = inv.find(i => i.name === 'furnace')
    if (!have) return false
    const ground = bot.blockAt(bot.entity.position.offset(0, -1, 0))
    await bot.placeBlock(ground, { x: 0, y: 1, z: 0 })
    return true
  } catch (_) {
    return false
  }
}

async function ensureFurnaceOrFind(bot, radius = 20) {
  let f = findFurnace(bot, radius)
  if (f) return f
  const placed = await ensureFurnace(bot)
  if (!placed) return null
  return findFurnace(bot, radius)
}

async function ensureFuel(bot) {
  // Best-effort: nothing to do here; fuel is drawn from inventory when depositing
  return true
}

module.exports = {
  smeltOres,
  createDriedKelp,
  createDriedKelpBlock,
  FuelJobQueue,
  getJobQueue,
  buildSmartFuelPlan,
  createCharcoal
}
