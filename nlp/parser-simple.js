/**
 * Simple NLP intent parser
 * Maps Dutch sentences to commands
 * Optionally uses Ollama (qwen-2.5-7b) if USE_OLLAMA=1
 */

const USE_OLLAMA = process.env.USE_OLLAMA === '1' || process.env.USE_OLLAMA === 'true'

/**
 * Rule-based parsing for Dutch
 */
function ruleBasedParse(message, username) {
  const s = message.toLowerCase()
  const intents = []

  // Simple keyword matching
  if (/(volg|volgen|follow)/i.test(s)) {
    intents.push({ cmd: 'follow', args: [username] })
  }
  if (/(kom hier|kom|come|naar me toe)/i.test(s)) {
    intents.push({ cmd: 'come', args: [username] })
  }
  if (/(hak|hakken|mine|timber|hout)/i.test(s)) {
    intents.push({ cmd: 'mine', args: ['oak_log'] })
  }
  if (/(basis|thuis|home|onthoud deze plek)/i.test(s)) {
    if (/(onthoud|set|opslaan)/i.test(s)) intents.push({ cmd: 'sethome', args: [] })
    else intents.push({ cmd: 'home', args: [] })
  }
  if (/(stop|stoppen)/i.test(s)) {
    intents.push({ cmd: 'stop', args: [] })
  }
  if (/(blijf|stay|wacht)/i.test(s)) {
    intents.push({ cmd: 'stop', args: [] })
  }

  return intents.length > 0 ? intents : null
}

/**
 * Call Ollama to parse Dutch intent
 */
async function callOllama(message, username) {
  const prompt = `Je bent een Nederlands-naar-commando parser voor een Minecraft bot.
Vertaal deze Nederlandse zin naar een JSON-array met commando's.
Toegestane commando's: follow, come, mine, home, sethome, stop, hello, help

Zin: "${message.replace(/"/g, '\\"')}"
Gebruiker: ${username}

Antwoord ALLEEN JSON in dit formaat:
[{"cmd":"follow","args":["${username}"]}, ...]`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen-2.5-7b', prompt, max_tokens: 200, stream: false }),
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`Status ${res.status}`)
    const data = await res.json()
    const text = data.response || ''
    const match = text.match(/\[([\s\S]*?)\]/)
    if (!match) return null

    const intents = JSON.parse(match[0])
    console.log('[NLP] Ollama parsed:', intents)
    return intents
  } catch (e) {
    console.warn('[NLP] Ollama failed:', e.message)
    return null
  }
}

/**
 * Main parser function
 */
export async function parseIntent(message, username) {
  if (USE_OLLAMA) {
    const fromOllama = await callOllama(message, username)
    if (fromOllama) return fromOllama
  }
  return ruleBasedParse(message, username)
}

export default { parseIntent }
