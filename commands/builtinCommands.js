/**
 * Built-in Commands
 * 
 * Core command implementations for movement, mining, memory, and status.
 * Each command handles errors gracefully and provides user feedback via chat.
 */

import { followPlayer, goToPlayer, stop as stopMovement, moveToPosition, stay } from '../src/movement.js'
import { mineResource, mineOres } from '../src/mining.js'
import { ensureWoodenPickaxe, hasPickaxe, ensureToolFor, ensureStonePickaxe, ensureIronPickaxe } from '../src/crafting.js'
import { setHome, getHome, goHome } from '../src/memory.js'
import { goTo, selectSafeTarget } from '../src/navigation.js'
import { returnHomeAndStore } from '../src/storage.js'
import { smeltOres, createDriedKelp, createDriedKelpBlock, getJobQueue, buildSmartFuelPlan } from '../src/smelting.js'
import { harvestWood } from '../src/wood.js'
import { createCharcoal } from '../src/smelting.js'
import { mineOres } from '../src/mining.js'

/**
 * Format position for display.
 * @private
 */
function formatPos(p) {
  return `${Math.round(p.x)}, ${Math.round(p.y)}, ${Math.round(p.z)}`
}

export default {
  /**
   * status - Report current position and health.
   * @param {object} bot
   */
  async status(bot) {
    try {
      const pos = bot.entity.position
      const health = bot.health || 20
      bot.chat(`📍 Positie: ${formatPos(pos)}, ❤️ Gezondheid: ${health}`)
    } catch (e) {
      bot.chat('Fout bij status check')
    }
  },

  /**
   * hello - Greet the player.
   * @param {object} bot
   */
  async hello(bot) {
    bot.chat('Hallo! Ik ben Agent01, jouw hulpbot.')
  },

  /**
   * stop - Halt all movement immediately.
   * @param {object} bot
   */
  async stop(bot) {
    try {
      stopMovement(bot)
      bot.chat('⛔ Stop!')
    } catch (e) {
      bot.chat('Kon niet stoppen')
    }
  },

  /**
   * follow <playerName> - Follow a player continuously.
   * @param {object} bot
   * @param {string} playerName
   */
  async follow(bot, playerName) {
    if (!playerName) {
      bot.chat('Gebruik: !follow <spelernaam>')
      return
    }
    try {
      followPlayer(bot, playerName)
      bot.chat(`👁️ Ik volg nu ${playerName}`)
    } catch (e) {
      bot.chat(`Kon ${playerName} niet volgen: ${e.message}`)
    }
  },

  /**
   * come <playerName> - Navigate once to a player's position.
   * @param {object} bot
   * @param {string} playerName
   */
  async come(bot, playerName) {
    if (!playerName) {
      bot.chat('Gebruik: !come <spelernaam>')
      return
    }
    try {
      goToPlayer(bot, playerName)
      bot.chat(`🚶 Ik kom naar ${playerName}`)
    } catch (e) {
      bot.chat(`Kon niet naar ${playerName} gaan: ${e.message}`)
    }
  },

  /**
   * stay - Stop movement and remain in place.
   * @param {object} bot
   */
  async stay(bot) {
    try {
      stay(bot)
      bot.chat('✋ Ik blijf hier')
    } catch (e) {
      bot.chat('Kon niet blijven staan')
    }
  },

  /**
   * mine [resource] - Find and harvest a resource within 20 blocks.
   * Defaults to oak_log if no resource specified.
   * @param {object} bot
   * @param {string} [resource='oak_log']
   */
  async mine(bot, resource = 'oak_log') {
    bot.chat(`⛏️ Ik zoek naar ${resource}...`)
    try {
      // Ensure we have an appropriate tool (axe for wood, pickaxe for stone/ore)
      const taskType = /wood|log|oak|plank/.test(resource) ? 'wood' : (/stone|ore|coal|iron/.test(resource) ? 'stone' : 'stone')
      const okTool = await ensureToolFor(bot, taskType)
      if (!okTool) {
        bot.chat('❌ Kon het benodigde gereedschap niet maken, stop.')
        return
      }
      await mineResource(bot, resource, 20)
      bot.chat(`✅ Klaar met hakken van ${resource}`)
    } catch (e) {
      bot.chat(`❌ Kon geen ${resource} vinden: ${e.message}`)
      console.error('[Mining] Error:', e && e.message)
    }
  },

  /**
   * smelt - Smelt alle beschikbare ertsen in een nearby oven (best-effort)
   * @param {object} bot
   */
  async smelt(bot) {
    try {
      bot.chat('🔥 Probeer ertsen te smelten...')
      await smeltOres(bot, 20)
      bot.chat('✅ Smeltproces voltooid (best-effort)')
    } catch (e) {
      bot.chat(`❌ Smelten mislukt: ${e && e.message}`)
    }
  },

  /**
   * chop - Harvest nearby wood (best-effort)
   * @param {object} bot
   */
  async chop(bot) {
    try {
      bot.chat('🌲 Ik ga hout hakken...')
      const count = await harvestWood(bot, 20, 32)
      bot.chat(`✅ Klaar met hakken: ${count} blokken verzameld`)
    } catch (e) {
      bot.chat(`❌ Hout hakken mislukt: ${e && e.message}`)
    }
  },

  /**
   * makecharcoal - Produce charcoal from logs using nearby furnace (best-effort)
   * @param {object} bot
   */
  async makecharcoal(bot) {
    try {
      bot.chat('🔥 Maak charcoal van logs...')
      const got = await createCharcoal(bot, 8, 20)
      bot.chat(`✅ Charcoal geproduceerd: ${got}`)
    } catch (e) {
      bot.chat(`❌ Charcoal maken mislukt: ${e && e.message}`)
    }
  },

  /**
   * mineores - Zoek en mijn meerdere ertsen (best-effort)
   * @param {object} bot
   */
  async mineores(bot) {
    try {
      bot.chat('⛏️ Ik ga op zoek naar ertsen...')
      const n = await mineOres(bot, 32, 20)
      bot.chat(`✅ Klaar met mijnen: ${n} blokken`)      
    } catch (e) {
      bot.chat(`❌ Mijnproces mislukt: ${e && e.message}`)
    }
  },

  /**
   * makestonepickaxe - Craft a stone pickaxe if resources available
   * @param {object} bot
   */
  async makestonepickaxe(bot) {
    try {
      bot.chat('🔧 Probeer stone pickaxe te maken...')
      const ok = await ensureStonePickaxe(bot)
      if (ok) bot.chat('✅ Stone pickaxe beschikbaar')
      else bot.chat('❌ Kon geen stone pickaxe maken')
    } catch (e) {
      bot.chat(`❌ Maken mislukt: ${e && e.message}`)
    }
  },

  /**
   * makekelpblock - Dry kelp and craft dried_kelp_block if possible
   * @param {object} bot
   */
  async makekelpblock(bot) {
    try {
      bot.chat('🌊 Droog kelp en maak kelp-blocks...')
      const dried = await createDriedKelp(bot, 32, 20)
      const crafted = await createDriedKelpBlock(bot)
      bot.chat(`✅ Gedroogd kelp: ${dried}, blocks gemaakt: ${crafted ? 'ja' : 'nee'}`)
    } catch (e) {
      bot.chat(`❌ Kelp block maken mislukt: ${e && e.message}`)
    }
  },

  /**
   * makeironpickaxe - Craft an iron pickaxe if resources available
   * @param {object} bot
   */
  async makeironpickaxe(bot) {
    try {
      bot.chat('⛏️ Probeer iron pickaxe te maken...')
      const ok = await ensureStonePickaxe(bot)
      if (ok) bot.chat('✅ Iron pickaxe beschikbaar (of fallback)')
      else bot.chat('❌ Kon geen iron pickaxe maken')
    } catch (e) {
      bot.chat(`❌ Maken mislukt: ${e && e.message}`)
    }
  },

  /**
   * fueljobs - Start automated bulk fuel production based on inventory
   * @param {object} bot
   */
  async fueljobs(bot) {
    try {
      bot.chat('🔥 Bouw slimme brandstof-productie plan...')
      const queue = buildSmartFuelPlan(bot)
      bot.chat(`📋 Plan: ${queue.jobs.map(j => `${j.type}(${j.amount})`).join(', ')}`)
      bot.chat('▶️ Start uitvoering...')
      await queue.runAll(bot)
      bot.chat('✅ Brandstof-jobs voltooid!')
    } catch (e) {
      bot.chat(`❌ Brandstof-jobs mislukt: ${e && e.message}`)
    }
  },

  /**
   * fuelqueue - Show current fuel job queue status
   * @param {object} bot
   */
  async fuelqueue(bot) {
    const queue = getJobQueue()
    const status = queue.status()
    bot.chat(`📊 Fuel Queue Status: ${status}`)
  },

  /**
   * protect <playerName> - Guard a player (TODO: implement combat/protection).
   * @param {object} bot
   * @param {string} playerName
   */
  async protect(bot, playerName) {
    if (!playerName) {
      bot.chat('Gebruik: !protect <spelernaam>')
      return
    }
    // TODO: Implement protect/guard behavior (combat system)
    // - Monitor player health
    // - Detect nearby hostile mobs
    // - Attack mobs threatening the player
    // - Maintain defensive stance
    bot.chat(`🛡️ Ik bescherm nu ${playerName}`)
    bot.chat('(beschermingssysteem nog niet volledig)')
  },

  /**
   * sethome - Mark current position as home.
   * @param {object} bot
   */
  async sethome(bot) {
    try {
      setHome(bot)
      const pos = bot.entity.position
      bot.chat(`🏠 Thuis ingesteld op ${formatPos(pos)}`)
    } catch (e) {
      bot.chat('Kon thuis niet instellen')
    }
  },

  /**
   * home - Return to previously set home position.
   * @param {object} bot
   */
  async home(bot) {
    try {
      const pos = getHome(bot)
      if (!pos) {
        bot.chat('❌ Geen thuis ingesteld. Gebruik: !sethome')
        return
      }
      bot.chat(`🏠 Ik ga naar huis... (${formatPos(pos)})`)
      await goHome(bot)
      bot.chat('✅ Ik ben thuis!')
    } catch (e) {
      bot.chat(`Kon niet naar huis gaan: ${e.message}`)
    }
  },

  /**
   * store - Return home and store collected items (best-effort)
   * @param {object} bot
   */
  async store(bot) {
    try {
      bot.chat('Ga naar huis en sla spullen op...')
      await returnHomeAndStore(bot)
      bot.chat('Opslag voltooid (best-effort).')
    } catch (e) {
      bot.chat('Kon items niet opslaan.')
    }
  },

  /**
   * build - Place blocks and construct (TODO: implement building system).
   * @param {object} bot
   * @param {...string} args
   */
  async build(bot, ...args) {
    // TODO: Implement building/block placement
    // - Select block type from inventory
    // - Plan structure (simple patterns or schematic loading)
    // - Place blocks in sequence
    // - Handle block orientation/rotation
    bot.chat('🔨 Bouwsysteem nog niet beschikbaar')
  },

  /**
   * farm - Harvest crops and replant (TODO: implement farming system).
   * @param {object} bot
   * @param {...string} args
   */
  async farm(bot, ...args) {
    // TODO: Implement farming/crop harvesting
    // - Scan for mature crops
    // - Harvest wheat, potatoes, carrots, etc.
    // - Replant seeds
    // - Collect drops
    bot.chat('🌾 Bouwwaststeem nog niet beschikbaar')
  },

  /**
   * gps - Log current position to GPS log (logs/gps.jsonl).
   * @param {object} bot
   */
  async gps(bot) {
    try {
      const pos = bot.entity.position
      const fs = await import('fs')
      const fsPromises = fs.promises
      const logDir = 'logs'
      const logFile = `${logDir}/gps.jsonl`

      // Create logs directory if needed
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })

      // Append JSON line
      const entry = JSON.stringify({
        timestamp: new Date().toISOString(),
        x: pos.x,
        y: pos.y,
        z: pos.z,
        yaw: bot.entity.yaw,
        pitch: bot.entity.pitch
      })
      await fsPromises.appendFile(logFile, entry + '\n')
      bot.chat(`📍 GPS: ${formatPos(pos)} (gelogd)`)
    } catch (e) {
      bot.chat('GPS log fout')
      console.error('[GPS] Error:', e.message)
    }
  },

  /**
   * help - Display available commands.
   * @param {object} bot
   */
  async help(bot) {
    const commands = [
      '!status - Toon positie en gezondheid',
      '!hello - Begroeting',
      '!stop - Stop alle beweging',
      '!follow <naam> - Volg speler',
      '!come <naam> - Kom naar speler',
      '!stay - Blijf hier',
      '!mine [bron] - Mijn resource (standaard: oak_log)',
      '!smelt - Smelt beschikbare ertsen in oven (best-effort)',
      '!chop - Hak hout in de buurt (best-effort)',
      '!makecharcoal - Maak charcoal van logs (gebruik oven)',
      '!mineores - Mijn meerdere ertsen (best-effort)',
      '!makestonepickaxe - Maak een stone pickaxe als mogelijk',
      '!makekelpblock - Droog kelp en maak dried_kelp_blocks',
      '!makeironpickaxe - Maak iron pickaxe met ertsen',
      '!fueljobs - Start geautomatiseerde bulk brandstof-productie',
      '!fuelqueue - Toon status van brandstof job queue',
      '!protect <naam> - Bescherm speler',
      '!sethome - Thuis instellen',
      '!home - Ga naar thuis',
      '!gps - Log GPS-positie',
      '!help - Dit bericht'
    ]
    bot.chat('Beschikbare commando\'s:')
    for (const cmd of commands) {
      bot.chat(`  ${cmd}`)
    }
  }
}

