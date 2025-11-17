const mineflayer = require('mineflayer');
const initCommandRouter = require('./commands/commandRouter.js');
const { setupPathfinder } = require('./src/movement.js');
const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'Agent01'
})
const { initCombatSystem } = require('./src/combat.js');

bot.on('spawn', () => {
  console.log('[Agent01] Bot spawned!')
  // Setup pathfinder for movement commands
  try {
    setupPathfinder(bot)
  } catch (e) {
    console.error('[Agent01] Pathfinder setup failed:', e)
  }
  // Combat system direct initialiseren
  const combatConfig = {
    detectionRadius: 12,
    priorityRadius: 6,
    maxHuntDistance: 14,
    followDistance: 2,
    creeperEvadeRadius: 6,
    ownerSafeHealth: 12,
    resumeFollowMs: 1200,
    enablePvpDefense: true
  }
  bot._combatSystem = initCombatSystem(bot, combatConfig)
  bot.chat('Hallo! Ik ben online.')
  // Initialize command router
  try {
    initCommandRouter(bot)
    console.log('[Agent01] Command router initialized.')
  } catch (e) {
    console.error('[Agent01] Failed to init command router:', e)
  }
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  console.log(`[Chat] ${username}: ${message}`)
})
bot.on('error', (err) => console.error('[Error]', err))
bot.on('end', () => console.log('[Agent01] Disconnected'))
import mineflayer from 'mineflayer'
import initCommandRouter from './commands/commandRouter.js'
import { setupPathfinder } from './src/movement.js'

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'Agent01'
})

import { initCombatSystem } from './src/combat.js'

bot.on('spawn', () => {
  console.log('[Agent01] Bot spawned!')
  // Setup pathfinder for movement commands
  try {
    setupPathfinder(bot)
  } catch (e) {
    console.error('[Agent01] Pathfinder setup failed:', e)
  }
  // Combat system direct initialiseren
  const combatConfig = {
    detectionRadius: 12,
    priorityRadius: 6,
    maxHuntDistance: 14,
    followDistance: 2,
    creeperEvadeRadius: 6,
    ownerSafeHealth: 12,
    resumeFollowMs: 1200,
    enablePvpDefense: true
  }
  bot._combatSystem = initCombatSystem(bot, combatConfig)
  bot.chat('Hallo! Ik ben online.')
  // Initialize command router
  try {
    initCommandRouter(bot)
    console.log('[Agent01] Command router initialized.')
  } catch (e) {
    console.error('[Agent01] Failed to init command router:', e)
  }
})

bot.on('chat', (username, message) => {
  if (username === bot.username) return
  console.log(`[Chat] ${username}: ${message}`)
})

bot.on('error', (err) => console.error('[Error]', err))
bot.on('end', () => console.log('[Agent01] Disconnected'))
