import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'

const bot = mineflayer.createBot({
  host: 'localhost', // werkt ook via LAN
  port: 30000,
  username: 'Agent01'
})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  console.log('Agent01 is online in the world!')
})
