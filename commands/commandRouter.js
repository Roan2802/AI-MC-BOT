import builtin from './builtinCommands.js'
import { parseIntent } from '../nlp/intentParser.js'

/**
 * Command router with NLP support.
 * Routes hard commands (!) and natural language intents to builtinCommands.
 * 
 * Hard commands (!command arg1 arg2) are executed immediately.
 * Natural language messages addressed to the bot are parsed via NLP,
 * split on conjunctions, and executed as intent sequences.
 * 
 * @param {object} bot - Mineflayer bot instance
 */
export default function initCommandRouter(bot) {
  const taskQueue = [] // TODO: Implement task queue for spam prevention
  let isProcessing = false

  /**
   * Execute a queued task with proper async handling.
   */
  async function processQueue() {
    if (isProcessing || taskQueue.length === 0) return
    isProcessing = true

    while (taskQueue.length > 0) {
      const task = taskQueue.shift()
      try {
        await task()
      } catch (e) {
        console.error('[Router] Task error:', e.message)
      }
    }

    isProcessing = false
  }

  bot.on('chat', (username, message) => {
    if (username === bot.username) return

    // Hard command (starts with !)
    if (message.startsWith('!')) {
      taskQueue.push(async () => {
        const parts = message.slice(1).split(' ')
        const cmd = parts[0].toLowerCase()
        const args = parts.slice(1)

        if (cmd === 'stop') {
          // TODO: Clear entire queue and stop all tasks
          bot.chat('Stoppend...')
          return
        }

        if (builtin[cmd]) {
          try {
            await builtin[cmd](bot, ...args)
          } catch (e) {
            console.error(`[Router] Error in !${cmd}:`, e.message)
            bot.chat(`Error: ${e.message}`)
          }
        } else {
          bot.chat(`Onbekend commando: !${cmd}`)
        }
      })
      processQueue()
      return
    }

    // Natural language (if addressed to bot)
    const lowered = message.toLowerCase()
    const addressed = lowered.includes('agent') || lowered.includes(bot.username.toLowerCase())

    if (addressed) {
      taskQueue.push(async () => {
        try {
          const intents = await parseIntent(message, username)
          if (!intents || intents.length === 0) {
            bot.chat('Ik begrijp je niet helemaal.')
            return
          }
          console.log('[Router] NLP intents:', intents)
          // Execute intents sequentially
          for (const intent of intents) {
            const fn = builtin[intent.cmd]
            if (fn) {
              await fn(bot, ...(intent.args || []))
            } else {
              console.warn(`[Router] Unknown command: ${intent.cmd}`)
            }
          }
        } catch (e) {
          console.error('[Router] NLP error:', e.message)
          bot.chat('Fout bij verwerking van je bericht.')
        }
      })
      processQueue()
    }
  })

  return { initCommandRouter }
}
