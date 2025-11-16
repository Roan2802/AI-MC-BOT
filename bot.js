import mineflayer from 'mineflayer'
import initCommandRouter from './commands/commandRouter.js'
import { setupPathfinder } from './src/movement.js'

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'Agent01'
})

bot.on('spawn', () => {
  console.log('[Agent01] Bot spawned!')
  // Setup pathfinder for movement commands
  try {
    setupPathfinder(bot)
  } catch (e) {
    console.error('[Agent01] Pathfinder setup failed:', e)
  }
  bot.chat('Hallo! Ik ben online.')
  // Initialize command router
  try {
    initCommandRouter(bot)
    console.log('[Agent01] Command router initialized.')
  } catch (e) {
    console.error('[Agent01] Failed to init command router:', e)
  }
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  console.log(`[Chat] ${username}: ${message}`)
})

bot.on('error', (err) => console.error('[Error]', err))
bot.on('end', () => console.log('[Agent01] Disconnected'))
