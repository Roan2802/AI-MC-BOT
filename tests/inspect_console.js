import * as safety from '../utils/safety.js'
console.log('after import safety, typeof console.log =', typeof console.log)
import * as combat from '../src/combat.js'
console.log('after import combat, typeof console.log =', typeof console.log)
import * as combatEnhanced from '../src/combatEnhanced.js'
console.log('after import combatEnhanced, typeof console.log =', typeof console.log)
import initCommandRouter from '../commands/commandRouter.js'
console.log('after import router, typeof console.log =', typeof console.log)
