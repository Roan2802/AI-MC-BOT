/**
 * Built-in Commands
 * 
 * Core command implementations for movement, mining, memory, and status.
 * Each command handles errors gracefully and provides user feedback via chat.
 */

import { followPlayer, goToPlayer, stop as stopMovement, moveToPosition, stay } from '../src/movement.js'
import { mineResource } from '../src/mining.js'
import { setHome, getHome, goHome } from '../src/memory.js'
import { goTo, selectSafeTarget } from '../src/navigation.js'

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
      await mineResource(bot, resource, 20)
      bot.chat(`✅ Klaar met hakken van ${resource}`)
    } catch (e) {
      bot.chat(`❌ Kon geen ${resource} vinden`)
      console.error('[Mining] Error:', e.message)
    }
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

