/**
 * Memory/Persistence Module
 * 
 * Stores and retrieves home position to/from disk (data/home.json).
 * Maintains in-memory cache via WeakMap for current session.
 */

const fs = require('fs');
const path = require('path');
const { goTo } = require('./navigation.js');

const homes = new WeakMap()
const dataDir = path.resolve(process.cwd(), 'data')
const homeFile = path.join(dataDir, 'home.json')

/**
 * Ensure data directory exists.
 * @private
 */
function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
}

/**
 * Set home position at current bot location.
 * Persists to data/home.json.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @throws {Error} If position data unavailable
 */
function setHome(bot) {
  try {
    const pos = bot.entity.position
    const simple = { x: pos.x, y: pos.y, z: pos.z }
    homes.set(bot, simple)
    ensureDataDir()
    fs.writeFileSync(homeFile, JSON.stringify(simple, null, 2))
    console.log(`[Memory] Home set at ${simple.x.toFixed(1)}, ${simple.y.toFixed(1)}, ${simple.z.toFixed(1)}`)
  } catch (e) {
    console.error('[Memory] setHome error:', e.message)
    throw new Error('Kan thuis niet instellen')
  }
}

/**
 * Get stored home position from cache or disk.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @returns {object|null} Position {x, y, z} or null if no home set
 * @throws {Error} If file parse fails critically
 */
function getHome(bot) {
  // Check in-memory cache first
  if (homes.has(bot)) {
    return homes.get(bot)
  }

  // Try loading from disk
  try {
    if (fs.existsSync(homeFile)) {
      const raw = fs.readFileSync(homeFile, 'utf8')
      const obj = JSON.parse(raw)
      homes.set(bot, obj)
      console.log('[Memory] Loaded home from disk')
      return obj
    }
  } catch (e) {
    console.error('[Memory] getHome parse error:', e.message)
  }

  return null
}

/**
 * Navigate to stored home position.
 * 
 * @param {object} bot - Mineflayer bot instance
 * @returns {Promise<void>}
 * @throws {Error} If no home set or movement fails
 */
function goHome(bot) {
  const pos = getHome(bot)
  if (!pos) {
    throw new Error('Geen thuis ingesteld')
  }
  console.log('[Memory] Going home...')
  // Use navigation.goTo which returns a Promise<boolean>
  return goTo(bot, pos, { timeout: 45000, maxRetries: 3 })
}

module.exports = { setHome, getHome, goHome };
