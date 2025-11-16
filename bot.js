import mineflayer from 'mineflayer'
import { pathfinder } from 'mineflayer-pathfinder'

const bot = mineflayer.createBot({
  host: '192.168.1.219', // jouw LAN-server IP
  port: 30000,           // jouw aangepaste poort
  username: 'Agent01'
})

bot.once('spawn', () => {
  bot.loadPlugin(pathfinder)
  console.log('Agent01 is online and ready on LAN!')
})
