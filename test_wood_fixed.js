/**
 * Comprehensive Wood Harvesting Test with Proper Pathfinder Setup
 */

const mineflayer = require('mineflayer');
const { harvestWood } = require('./src/wood.js');
const { setupPathfinder } = require('./src/movement.js');

let testResults = {
  connection: false,
  spawn: false,
  pathfinder: false,
  inventory: false,
  axe_find: false,
  harvest: false,
  errors: []
};

console.log('\n' + '='.repeat(60));
console.log('🧪 WOOD HARVESTING TEST WITH PATHFINDER');
console.log('='.repeat(60) + '\n');

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'WoodTestBot',
  version: false
});

bot.once('login', () => {
  console.log('✅ [1] Bot logged in successfully');
  testResults.connection = true;
});

bot.on('spawn', async () => {
  console.log('✅ [2] Bot spawned');

  try {
    await new Promise(r => setTimeout(r, 2000)); // Wait for full spawn

    // Initialize pathfinder properly
    console.log('🔧 [3] Initializing pathfinder...');
    try {
      if (!bot.pathfinder) {
        setupPathfinder(bot);
        testResults.pathfinder = true;
        console.log('✅ Pathfinder initialized');
      } else {
        testResults.pathfinder = true;
        console.log('✅ Pathfinder already initialized');
      }
    } catch (pathErr) {
      console.log('❌ Pathfinder initialization failed:', pathErr.message);
      testResults.errors.push(`Pathfinder: ${pathErr.message}`);
      printSummary();
      process.exit(1);
    }

    // TEST: Check inventory
    console.log('\n📋 TEST: Inventory Check');
    const inventoryItems = bot.inventory.items();
    console.log(`   Items in inventory: ${inventoryItems.length}`);
    if (inventoryItems.length > 0) {
      console.log('   Items:');
      inventoryItems.forEach(item => {
        console.log(`     - ${item.name} x${item.count}`);
      });
      testResults.inventory = true;
    } else {
      console.log('   ⚠️  Empty inventory');
    }

    // TEST: Check for axes
    console.log('\n🪓 TEST: Axe Detection');
    const items = bot.inventory.items();
    const axes = items.filter(i => i.name && i.name.includes('axe'));
    if (axes.length > 0) {
      console.log(`   ✅ Found ${axes.length} axe(s):`);
      axes.forEach(axe => console.log(`     - ${axe.name} x${axe.count}`));
      testResults.axe_find = true;
    } else {
      console.log('   ⚠️  No axes found');
    }

    // TEST: Check for logs nearby
    console.log('\n🌳 TEST: Wood Detection');
    const logBlock = bot.findBlock({
      matching: b => b && b.name && b.name.includes('log'),
      maxDistance: 64,
      count: 1
    });

    if (logBlock) {
      const dist = bot.entity.position.distanceTo(logBlock.position);
      console.log(`   ✅ Found ${logBlock.name} at distance ${dist.toFixed(1)} blocks`);
      console.log(`      Position: ${Math.round(logBlock.position.x)}, ${Math.round(logBlock.position.y)}, ${Math.round(logBlock.position.z)}`);
    } else {
      console.log('   ⚠️  No logs found within 64 blocks');
    }

    // TEST: Run actual harvest
    console.log('\n🪵 TEST: Running Harvest (3 logs)');
    console.log('   Starting harvestWood(bot, 20, 3)...');

    try {
      const result = await harvestWood(bot, 20, 3);
      console.log(`   ✅ Harvest completed: ${result} logs collected`);
      testResults.harvest = result > 0;
    } catch (harvestErr) {
      console.log(`   ❌ Harvest error: ${harvestErr.message}`);
      testResults.errors.push(`Harvest: ${harvestErr.message}`);
    }

    // Print summary
    await new Promise(r => setTimeout(r, 2000));
    printSummary();

  } catch (error) {
    console.error('Test execution error:', error);
    testResults.errors.push(`Main: ${error.message}`);
    printSummary();
  }

  // Exit after tests
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

bot.on('error', (err) => {
  console.error('❌ Bot error:', err.message);
  testResults.errors.push(`Connection: ${err.message}`);
  process.exit(1);
});

function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Connection:       ${testResults.connection ? '✅' : '❌'}`);
  console.log(`Spawn:            ${testResults.spawn ? '✅' : '❌'}`);
  console.log(`Pathfinder:       ${testResults.pathfinder ? '✅' : '❌'}`);
  console.log(`Inventory:        ${testResults.inventory ? '✅' : '⚠️ '}`);
  console.log(`Axe Detection:    ${testResults.axe_find ? '✅' : '⚠️ '}`);
  console.log(`Harvest:          ${testResults.harvest ? '✅' : '❌'}`);

  if (testResults.errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    testResults.errors.forEach(err => console.log(`   - ${err}`));
  }
  console.log('\n' + '='.repeat(60) + '\n');
}