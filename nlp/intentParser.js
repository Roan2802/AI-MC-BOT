/**
 * NLP Intent Parser: Converts Dutch natural language to command intents.
 * Supports rule-based parsing + optional Ollama (qwen-2.5-7b) AI.
 * 
 * Input: message string + username
 * Output: array of intents [{cmd: 'follow', args: [...]}, ...] or null
 */

const USE_OLLAMA = process.env.USE_OLLAMA === '1' || process.env.USE_OLLAMA === 'true'

/**
 * Rule-based Dutch parsing for intents.
 * Splits on "en dan", "daarna", "en" and recognizes keywords.
 * 
 * @param {string} message - Raw message text
 * @param {string} username - Sender username for context
 * @returns {array|null} Array of intents or null if no matches
 */
function ruleBasedParse(message, username) {
  const s = message.toLowerCase()
  const parts = s.split(/(?: en dan | daarna | en )/)
  const intents = []

  for (let part of parts) {
    part = part.trim()
    if (!part) continue

    if (/(volg|volg me|volg mij)/.test(part)) {
      intents.push({ cmd: 'follow', args: [username] })
    } else if (/(kom hier|kom|kom naar|ga naar mij)/.test(part)) {
      intents.push({ cmd: 'come', args: [username] })
    } else if (/(blijf|stop hier|blijven)/.test(part)) {
      intents.push({ cmd: 'stay', args: [] })
    } else if (/(hak|hakken|mine|mijn|hak hout|hout)/.test(part)) {
      intents.push({ cmd: 'mine', args: ['oak_log'] })
    } else if (/(basis|thuis|home|onthoud|onthoud deze plek)/.test(part)) {
      if (/(onthoud|onthoud deze plek)/.test(part)) {
        intents.push({ cmd: 'sethome', args: [] })
      } else {
        intents.push({ cmd: 'home', args: [] })
      }
    } else if (/(bescherm|protect)/.test(part)) {
      intents.push({ cmd: 'protect', args: [username] })
    } else if (/(status)/.test(part)) {
      intents.push({ cmd: 'status', args: [] })
    }
  }

  return intents.length > 0 ? intents : null
}

/**
 * Call Ollama AI API for intent parsing.
 * Fallback to rule-based if Ollama unavailable or timeout.
 * 
 * @param {string} message - User message
 * @param {string} username - Sender username
 * @returns {Promise<array|null>} Intents or null
 */
async function callOllama(message, username) {
  const prompt = `Vertaal naar Minecraft-commando intents. Toegestane types: follow, come, stay, mine, home, sethome, protect, status.
Input: "${message}" User: ${username}
Retourneer JSON-array: [{"cmd":"follow","args":["username"]}, ...]`

  const RETRIES = 2
  const TIMEOUT_MS = 4000

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const res = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen-2.5-7b', prompt, max_tokens: 300 }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      if (!res.ok) throw new Error(`Status ${res.status}`)

      const text = await res.text()
      const match = text.match(/\[([\s\S]*?)\]/)
      if (!match) throw new Error('No JSON array in response')

      return JSON.parse(match[0])
    } catch (e) {
      if (attempt === RETRIES) return null
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  return null
}

/**
 * Parse user message into command intents.
 * 
 * @param {string} message - Raw user message
 * @param {string} username - Sender username
 * @returns {Promise<array|null>} Array of intents or null if unclear
 * @throws {Error} Only if unexpected errors occur
 */
async function parseIntent(message, username) {
  if (USE_OLLAMA) {
    const result = await callOllama(message, username)
    if (result && Array.isArray(result) && result.length > 0) return result
  }
  return ruleBasedParse(message, username)
}

module.exports = { parseIntent };

