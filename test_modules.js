#!/usr/bin/env node
/**
 * Module validation test - checks if all modules load without errors
 */

console.log('=== Module Load Test ===\n');

const modules = [
  { name: 'utils/logger.js', path: './utils/logger.js' },
  { name: 'utils/safety.js', path: './utils/safety.js' },
  { name: 'src/memory.js', path: './src/memory.js' },
  { name: 'src/navigation.js', path: './src/navigation.js' },
  { name: 'src/inventory.js', path: './src/inventory.js' },
  { name: 'src/crafting.js', path: './src/crafting.js' },
  { name: 'src/smelting.js', path: './src/smelting.js' },
  { name: 'src/wood.js', path: './src/wood.js' },
  { name: 'src/mining.js', path: './src/mining.js' },
  { name: 'src/movement.js', path: './src/movement.js' },
  { name: 'src/storage.js', path: './src/storage.js' },
  { name: 'src/automation.js', path: './src/automation.js' },
  { name: 'src/combat.js', path: './src/combat.js' },
  { name: 'src/combatEnhanced.js', path: './src/combatEnhanced.js' },
  { name: 'src/safetyMonitor.js', path: './src/safetyMonitor.js' },
  { name: 'commands/builtinCommands.js', path: './commands/builtinCommands.js' },
  { name: 'commands/commandRouter.js', path: './commands/commandRouter.js' }
];

let passed = 0;
let failed = 0;

for (const mod of modules) {
  try {
    const loaded = require(mod.path);
    console.log(`✅ ${mod.name}`);
    passed++;
  } catch (e) {
    console.error(`❌ ${mod.name}`);
    console.error(`   Error: ${e.message}`);
    if (e.stack) {
      const lines = e.stack.split('\n').slice(0, 3);
      lines.forEach(line => console.error(`   ${line}`));
    }
    failed++;
  }
}

console.log(`\n=== Results ===`);
console.log(`✅ Passed: ${passed}/${modules.length}`);
console.log(`❌ Failed: ${failed}/${modules.length}`);

if (failed === 0) {
  console.log('\n🎉 All modules loaded successfully!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some modules failed to load. Fix errors above.');
  process.exit(1);
}
