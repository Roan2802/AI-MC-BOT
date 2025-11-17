/**
 * Storage helpers
 *
 * Provide a simple routine to return home and store or drop collected items.
 */

const { goHome } = require('./memory.js');

/**
 * Return to home and store inventory.
 * Best-effort: if a chest is found near home, drop items on ground will be attempted
 * otherwise the bot will `toss` non-tool items to free inventory.
 * @param {import('mineflayer').Bot} bot
 * @returns {Promise<void>}
 */
async function returnHomeAndStore(bot) {
  try {
    const arrived = await goHome(bot)
    if (!arrived) {
      console.warn('[Storage] goHome failed or timed out')
    }

    // wait until near home position (or short timeout)
    const homePos = bot.entity.position
    const arriveOk = await new Promise((resolve) => {
      const start = Date.now()
      const iv = setInterval(() => {
        const d = bot.entity.position.distanceTo(homePos)
        if (d < 3) { clearInterval(iv); resolve(true); return }
        if (Date.now() - start > 10000) { clearInterval(iv); resolve(false); return }
      }, 500)
    })

    // scan nearby for chests (5x3x5) and trapped chest variants; pick nearest
    const pos = bot.entity.position
    const candidates = []
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -5; dz <= 5; dz++) {
          const b = bot.blockAt(pos.offset(dx, dy, dz))
          if (!b || !b.name) continue
          if (b.name.includes('chest') || b.name.includes('trapped_chest')) {
            candidates.push(b)
          }
        }
      }
    }
    let chestBlock = null
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos))
      chestBlock = candidates[0]
    }

    // Define tools to keep
    const keep = ['pickaxe', 'axe', 'crafting_table', 'stick']

    if (!chestBlock) {
      // No chest found: toss non-tool items to clear inventory
      const items = bot.inventory.items()
      for (const it of items) {
        const name = it.name || ''
        if (keep.some(k => name.includes(k))) continue
        try {
          await bot.toss(it.type, null, it.count)
        } catch (e) {
          // ignore toss errors
        }
      }
      return
    }

    // If chest found, attempt to open and deposit items (best-effort using container API)
    try {
      const chest = await bot.openChest(chestBlock)
      const items = bot.inventory.items()
      for (const it of items) {
        const name = it.name || ''
        if (keep.some(k => name.includes(k))) continue
        let attempts = 0
        let deposited = false
        while (attempts < 3 && !deposited) {
          try {
            await chest.deposit(it.type, null, it.count)
            deposited = true
          } catch (e) {
            attempts++
            await new Promise(r => setTimeout(r, 500))
          }
        }
        if (!deposited) {
          try { await bot.toss(it.type, null, it.count) } catch (_) {}
        }
      }
      chest.close()
    } catch (e) {
      // opening chest failed; fallback to toss
      const items = bot.inventory.items()
      for (const it of items) {
        const name = it.name || ''
        if (keep.some(k => name.includes(k))) continue
        try { await bot.toss(it.type, null, it.count) } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[Storage] returnHomeAndStore failed:', e && e.message)
  }
}

module.exports = { returnHomeAndStore };
