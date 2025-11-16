import fs from 'fs'
import path from 'path'

const homes = new WeakMap()
const dataDir = path.resolve(process.cwd(), 'data')
const homeFile = path.join(dataDir, 'home.json')

function ensureDataDir(){ if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true }) }

export function setHome(bot){
  const pos = bot.entity.position
  const simple = { x: pos.x, y: pos.y, z: pos.z }
  homes.set(bot, simple)
  try{
    ensureDataDir()
    fs.writeFileSync(homeFile, JSON.stringify(simple, null, 2))
  } catch(e){ /* ignore write errors for now */ }
}

export function getHome(bot){
  if (homes.has(bot)) return homes.get(bot)
  try{
    if (fs.existsSync(homeFile)){
      const raw = fs.readFileSync(homeFile, 'utf8')
      const obj = JSON.parse(raw)
      homes.set(bot, obj)
      return obj
    }
  } catch(e){ /* ignore parse errors */ }
  return null
}

export function goHome(bot){
  const pos = getHome(bot)
  if (!pos) throw new Error('no_home')
  // delegate to movement
  return import('./movement.js').then(m=> m.moveToPosition(bot, pos))
}

export default { setHome, getHome, goHome }
