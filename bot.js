import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'
import attachMovement from './src/movement.js'

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'Agent01'
})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  // attach movement intelligence (follow/stop, parkour, safety, GPS)
  try {
    attachMovement(bot, { allowTeleportCommands: false })
  } catch (e) {
    console.warn('Failed to attach movement module:', e)
  }
  console.log('Agent01 is online in the world!')
})
