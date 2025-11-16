/**
 * Intent parser with optional Ollama integration.
 * If `process.env.USE_OLLAMA` is set to '1' or 'true', the parser will
 * call a local Ollama HTTP API at http://localhost:11434/api/generate and
 * ask the model `qwen-2.5-7b` to return a JSON array of intents.
 * If Ollama is unavailable or parsing fails, falls back to the rule-based parser.
 *
 * Input: raw chat string and metadata { username }
 * Output: array of intents: { type: 'mine'|'follow'|..., args: {...} }
 */
const USE_OLLAMA = process.env.USE_OLLAMA === '1' || process.env.USE_OLLAMA === 'true'

function ruleBasedParse(message, meta = {}){
  const s = message.toLowerCase()
  const username = meta.username
  const parts = s.split(/(?: en dan | daarna | en )/)
  const intents = []
  for (let part of parts){
    part = part.trim()
    if (!part) continue
    if (/(volg|volg me|volg mij|volg)/.test(part)){
      intents.push({ type: 'follow', args: { player: username } })
      continue
    }
    if (/(kom hier|kom|kom naar|ga naar mij)/.test(part)){
      intents.push({ type: 'come', args: { player: username } })
      continue
    }
    if (/(blijf|stop hier|blijven)/.test(part)){
      intents.push({ type: 'stay' })
      continue
    }
    if (/(hak|hakken|mine|mijn|hak hout|hout)/.test(part)){
      intents.push({ type: 'mine', args: { resource: 'wood' } })
      continue
    }
    if (/(basis|thuis|home|onthoud|onthoud deze plek)/.test(part)){
      if (/(onthoud|onthoud deze plek)/.test(part)) intents.push({ type: 'sethome' })
      else intents.push({ type: 'home' })
      continue
    }
    if (/(bescherm|protect)/.test(part)){
      intents.push({ type: 'protect', args: { player: username } })
      continue
    }
    intents.push({ type: 'clarify' })
  }
  return intents
}

async function callOllama(message, meta = {}){
  const prompt = `Je bent een assistent die Nederlandse spraak naar een lijst met core intents vertaalt voor een Minecraft bot.\n\n` +
    `Doel: gegeven de input, retourneer exact één JSON-array met intent-objecten. Voorbeeld: ` +
    `[ {"type":"mine","args":{"resource":"wood"}}, {"type":"come","args":{"player":"playername"}} ]\n\n` +
    `Toegestane types: follow, come, stay, mine, sethome, home, protect, status, stop\n` +
    `Gebruik het veld 'player' met de verzender wanneer relevant.\n\n` +
    `Input: "${message.replace(/"/g, '\"')}"\nUsername: ${meta.username || ''}\n\n` +
    `Output alleen JSON-array (geen extra tekst):`

  const url = 'http://localhost:11434/api/generate'
  const body = { model: 'qwen-2.5-7b', prompt, max_tokens: 300 }
  const RETRIES = 2
  const TIMEOUT_MS = 4000
  for (let attempt=0; attempt<=RETRIES; attempt++){
    try {
      const controller = new AbortController()
      const id = setTimeout(()=> controller.abort(), TIMEOUT_MS)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      })
      clearTimeout(id)
      if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
      const text = await res.text()
      // try to extract JSON array robustly using regex for first [...] block
      const match = text.match(/\[([\s\S]*?)\]/)
      if (!match) throw new Error('No JSON array in Ollama response')
      const jsonText = match[0]
      const intents = JSON.parse(jsonText)
      return intents
    } catch (e){
      console.warn(`Ollama attempt ${attempt} failed:`, e.message || e)
      if (attempt === RETRIES) {
        console.warn('Ollama parse failed after retries, falling back to rule-based')
        return null
      }
      // small backoff
      await new Promise(r=>setTimeout(r, 300 * (attempt+1)))
    }
  }
}

export default async function parseIntent(message, meta = {}){
  if (!USE_OLLAMA) return ruleBasedParse(message, meta)
  const fromModel = await callOllama(message, meta)
  if (fromModel && Array.isArray(fromModel) && fromModel.length>0) return fromModel
  return ruleBasedParse(message, meta)
}

