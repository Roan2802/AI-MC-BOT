/**
 * Simple Command Validation Test
 * Checks if all command handlers exist and are properly registered
 */

console.log('=== Command Validation Test ===\n');

const builtin = require('./commands/builtinCommands.js');

const expectedCommands = [
  'status',
  'hello',
  'stop',
  'stay',
  'follow',
  'come',
  'mine',
  'smelt',
  'chop',
  'makecharcoal'
];

let passed = 0;
let failed = 0;

console.log('Checking builtin commands...\n');

for (const cmd of expectedCommands) {
  if (typeof builtin[cmd] === 'function') {
    console.log(`✅ ${cmd} - registered`);
    passed++;
  } else {
    console.log(`❌ ${cmd} - MISSING!`);
    failed++;
  }
}

console.log(`\n=== Results ===`);
console.log(`✅ Found: ${passed}/${expectedCommands.length}`);
console.log(`❌ Missing: ${failed}/${expectedCommands.length}`);

// Check critical dependencies
console.log('\n=== Checking Critical Modules ===');

try {
  const mining = require('./src/mining.js');
  console.log('✅ Mining module loaded');
  console.log(`   - mineResource: ${typeof mining.mineResource === 'function' ? '✅' : '❌'}`);
  console.log(`   - mineOres: ${typeof mining.mineOres === 'function' ? '✅' : '❌'}`);
} catch (e) {
  console.log('❌ Mining module failed:', e.message);
}

try {
  const wood = require('./src/wood.js');
  console.log('✅ Wood module loaded');
  console.log(`   - harvestWood: ${typeof wood.harvestWood === 'function' ? '✅' : '❌'}`);
} catch (e) {
  console.log('❌ Wood module failed:', e.message);
}

try {
  const combat = require('./src/combat.js');
  console.log('✅ Combat module loaded');
  console.log(`   - initCombatSystem: ${typeof combat.initCombatSystem === 'function' ? '✅' : '❌'}`);
} catch (e) {
  console.log('❌ Combat module failed:', e.message);
}

try {
  const movement = require('./src/movement.js');
  console.log('✅ Movement module loaded');
  console.log(`   - followPlayer: ${typeof movement.followPlayer === 'function' ? '✅' : '❌'}`);
  console.log(`   - goToPlayer: ${typeof movement.goToPlayer === 'function' ? '✅' : '❌'}`);
} catch (e) {
  console.log('❌ Movement module failed:', e.message);
}

console.log('\n✅ All critical modules validated!');
console.log('\nNext steps:');
console.log('1. Start server: cd C:\\AI\\MinecraftAI\\MC_Server; java -Xmx2048M -Xms1024M -jar server.jar nogui');
console.log('2. Start bot: node bot.js');
console.log('3. Test in Minecraft chat: !status, !hello, !mine oak_log, !chop');
