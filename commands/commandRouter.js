import builtin from './builtinCommands.js'
import { parseIntent } from '../nlp/intentParser.js'
import { createDefaultEngine } from '../src/automation.js'
import { startSafetyMonitor } from '../src/safetyMonitor.js'
import { startCombatMonitor } from '../src/combat.js'
import { tryInitEnhanced, enableAutoEat } from '../src/combatEnhanced.js'

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
  // Prevent multiple initializations (e.g., respawn triggers)
  if (bot._commandRouterInitialized) {
    if (bot._debug) console.log('[Router] already initialized, skipping')
    return { initCommandRouter }
  }
  bot._commandRouterInitialized = true
  const taskQueue = [] // TODO: Implement task queue for spam prevention
  let isProcessing = false
  const automationEngine = createDefaultEngine(bot) // Initialize automation engine
  let automationEnabled = false

  // If bot doesn't expose chat (e.g., unit tests with fakeBot), skip long-running
  // monitors and periodic automation to avoid keeping the process alive.
  const headless = (typeof bot.chat !== 'function') || process.env.NODE_ENV === 'test'
  if (!headless) {
    // Start safety monitor (lava / fire / deep-drop avoidance)
    try {
      startSafetyMonitor(bot, { intervalMs: 1500, searchRadius: 6 })
      console.log('[Safety] Safety monitor gestart')
    } catch (e) {
      console.error('[Safety] Kon safety monitor niet starten:', e && e.message)
    }

    try {
      startCombatMonitor(bot, { intervalMs: 1200, scanRange: 12, fleeHealth: 6 })
      console.log('[Combat] Combat monitor gestart')
    } catch (e) {
      console.error('[Combat] Kon combat monitor niet starten:', e && e.message)
    }

    // Try to initialize optional enhanced combat features (plugins)
    try {
      tryInitEnhanced(bot).then(() => {
        // enable auto-eat if available
        enableAutoEat(bot, { priority: 'saturation' })
      }).catch(err => console.warn('[CombatEnhanced] init failed:', err && err.message))
    } catch (e) {
      console.warn('[CombatEnhanced] could not init:', e && e.message)
    }
  } else {
    if (bot._debug) console.log('[Router] headless/test bot detected — skipping monitors')
  }

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

  // Periodic automation check (every 10 seconds)
  // Only run automation loop for real bots (not headless/test fakes)
  if (!((typeof bot.chat !== 'function') || process.env.NODE_ENV === 'test')) {
    setInterval(async () => {
      if (!automationEnabled) return
      try {
        const triggered = automationEngine.evaluateRules()
        if (triggered.length > 0) {
          await automationEngine.executeRules(triggered, false) // Queue for processing
        }
        // Process queued automation tasks
        const completed = await automationEngine.processTasks()
        if (completed > 0) {
          console.log(`[Automation] Processed ${completed} queued tasks`)
        }
      } catch (e) {
        console.error('[Automation] Periodic check failed:', e.message)
      }
    }, 10000)
  } else {
    if (bot._debug) console.log('[Router] skipping automation loop in headless/test mode')
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
          automationEnabled = false
          bot.chat('Stoppend...')
          return
        }

        if (cmd === 'auto' || cmd === 'automation') {
          automationEnabled = !automationEnabled
          bot.chat(`Automatisering ${automationEnabled ? 'ingeschakeld ✅' : 'uitgeschakeld ❌'}`)
          return
        }

        if (cmd === 'autostatus') {
          bot.chat(automationEngine.status())
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
                bot.chat(`Onbekend commando: ${cmd}`)
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
