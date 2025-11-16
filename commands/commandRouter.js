import builtin from './builtinCommands.js'
import intentParser from '../nlp/intentParser.js'
import logger from '../utils/logger.js'

/**
 * Simple command router and task queue.
 * - Hard commands start with '!'
 * - Natural language addressed to the bot is parsed by intentParser
 */
export default function initCommandRouter(bot){
  const queue = []
  let busy = false
  const userTimestamps = new Map()
  const SPAM_MS = 1500

  async function runNext(){
    if (busy) return
    const task = queue.shift()
    if (!task) return
    busy = true
    try {
      await task()
    } catch (err) {
      logger.error('Task error', err)
      bot.chat('Er is een fout opgetreden tijdens het uitvoeren van een taak.')
    } finally {
      busy = false
      setImmediate(runNext)
    }
  }

  function enqueue(fn){ queue.push(fn); runNext() }

  function clearQueue(){ queue.length = 0 }

  bot.on('chat', (username, message) => {
    if (username === bot.username) return
    const now = Date.now()
    const last = userTimestamps.get(username) || 0
    if (now - last < SPAM_MS) {
      bot.chat('Rustig aan, ik verwerk je vorige opdracht nog.')
      return
    }
    userTimestamps.set(username, now)

    if (message.startsWith('!')) {
      const parts = message.slice(1).split(' ')
      const cmd = parts[0]
      const args = parts.slice(1)
      if (cmd === 'stop') {
        clearQueue()
        try { builtin.stop(bot) } catch(e){}
        bot.chat('Alle taken zijn gestopt.')
        return
      }
      if (builtin[cmd]){
        enqueue(()=> builtin[cmd](bot, ...args))
      } else {
        bot.chat(`Onbekend commando: ${cmd}`)
      }
    } else {
      const lowered = message.toLowerCase()
      const addressed = lowered.includes('agent') || lowered.includes(bot.username.toLowerCase())
      if (addressed) {
        Promise.resolve(intentParser(message, { username })).then((intents)=>{
          if (!intents || intents.length === 0) {
            bot.chat('Ik begrijp je niet helemaal — kun je het korter formuleren?')
            return
          }
          // if clarification needed
          if (intents.some(i=>i.type === 'clarify')){
            bot.chat('Kun je dat specificeren? (bijv. "hak hout")')
            return
          }
          for (const intent of intents){
            const fn = builtin[intent.type]
            if (!fn) {
              bot.chat(`Ik ken het commando ${intent.type} nog niet.`)
              continue
            }
            enqueue(()=> fn(bot, ...(intent.args ? Object.values(intent.args) : [])))
          }
        }).catch(e=>{
          console.warn('intentParser failed:', e)
          bot.chat('Er is een fout bij het interpreteren van je bericht.')
        })
      }
    }
  })

  return { enqueue, clearQueue }
}
