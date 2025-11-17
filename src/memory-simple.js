const fs = require('fs');
const path = require('path');

const dataDir = path.resolve(process.cwd(), 'data')
const homeFile = path.join(dataDir, 'home.json')

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
}

/**
 * Set home position for the bot
 */
function setHome(bot) {
  const pos = bot.entity.position
  const home = { x: pos.x, y: pos.y, z: pos.z }
  try {
    ensureDataDir()
    fs.writeFileSync(homeFile, JSON.stringify(home, null, 2))
    console.log('[Memory] Home saved:', home)
  } catch (e) {
    console.error('[Memory] Failed to save home:', e.message)
  }
}

/**
 * Get home position
 */
function getHome(bot) {
  try {
    if (fs.existsSync(homeFile)) {
      const raw = fs.readFileSync(homeFile, 'utf8')
      const home = JSON.parse(raw)
      console.log('[Memory] Home loaded:', home)
      return home
    }
  } catch (e) {
    console.error('[Memory] Failed to load home:', e.message)
  }
  return null
}

module.exports = { setHome, getHome };
