const safety = require('../utils/safety.js');
console.log('after import safety, typeof console.log =', typeof console.log)
const combat = require('../src/combat.js');
console.log('after import combat, typeof console.log =', typeof console.log)
const combatEnhanced = require('../src/combatEnhanced.js');
console.log('after import combatEnhanced, typeof console.log =', typeof console.log)
const initCommandRouter = require('../commands/commandRouter.js');
console.log('after import router, typeof console.log =', typeof console.log)
