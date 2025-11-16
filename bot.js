import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder } = pathfinderPkg
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
  // init command router for builtins and NLP
  try {
    import('./commands/commandRouter.js').then(m=> m.default(bot)).catch(e=> console.warn('Failed to init command router:', e))
  } catch (e){
    console.warn('Failed to init command router (sync):', e)
  }
  console.log('Agent01 is online in the world!')
})
