import * as movement from '../src/movement.js'
import mining from '../src/mining.js'
import memory from '../src/memory.js'
import logger from '../utils/logger.js'

/**
 * Core builtin commands. Each function receives (bot, ...args)
 */
export default {
  async follow(bot, playerName){
    try {
      const name = playerName || 'unknown'
      movement.followPlayer(bot, name)
      bot.chat(`Oké, ik volg ${name}`)
    } catch (e){
      logger.error('follow failed', e)
      bot.chat(`Kon speler ${playerName} niet vinden.`)
    }
  },

  async come(bot, playerName){
    try {
      const name = playerName || 'unknown'
      movement.goToPlayer(bot, name)
      bot.chat(`Ik ga naar ${name}`)
    } catch (e){
      logger.error('come failed', e)
      bot.chat(`Kon niet naar ${playerName} gaan.`)
    }
  },

  async stay(bot){
    movement.stay(bot)
    bot.chat('Ik blijf hier.')
  },

  async mine(bot, resource){
    const res = resource || 'wood'
    bot.chat(`Ik ga proberen ${res} te hakken.`)
    try {
      await mining.mineResource(bot, res)
    } catch (e){
      logger.error('mine failed', e)
      bot.chat(`Ik kon geen ${res} vinden binnen bereik.`)
    }
  },

  async protect(bot, playerName){
    bot.chat(`Oké, ik bescherm ${playerName || 'jou'}. (TODO: implement protect/guard behavior)`)
  },

  async sethome(bot){
    memory.setHome(bot)
    bot.chat('Basis opgeslagen.')
  },

  async home(bot){
    const pos = memory.getHome(bot)
    if (!pos) { bot.chat('Er is geen basis ingesteld.'); return }
    bot.chat('Ga naar de basis...')
    movement.moveToPosition(bot, pos)
  },

  async status(bot){
    const pos = bot.entity.position
    bot.chat(`Positie: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`)
  },

  async gps(bot, count = 5){
    // read last N lines from logs/gps.jsonl
    try {
      const fs = await import('fs')
      const path = await import('path')
      const gpsFile = path.resolve(process.cwd(), 'logs', 'gps.jsonl')
      if (!fs.existsSync(gpsFile)) { bot.chat('Geen GPS-log gevonden.'); return }
      const raw = fs.readFileSync(gpsFile, 'utf8').trim().split('\n')
      const lines = raw.slice(-Math.max(1, Number(count)))
      for (const l of lines){
        try { const obj = JSON.parse(l); bot.chat(`${obj.ts} - ${obj.bot.x.toFixed(1)},${obj.bot.y.toFixed(1)},${obj.bot.z.toFixed(1)}${obj.following && obj.following.username ? ` following ${obj.following.username}` : ''}`) } catch(e){}
      }
    } catch (e){
      bot.chat('Kon GPS-log niet lezen.')
    }
  },

  async stop(bot){
    movement.stay(bot)
    bot.chat('Stop commando ontvangen — actie afgebroken.')
  }
}
