/**
 * Comprehensive Wood Harvesting Diagnostic Test
 * Tests each component of the wood harvesting system step-by-step
 */

const mineflayer = require('mineflayer');
const { harvestWood } = require('./src/wood.js');
const { getBestAxe, ensureWoodenAxe } = require('./src/crafting-tools.js');
const { ensureCraftingTable } = require('./src/crafting-blocks.js');
const { craftPlanksFromLogs } = require('./src/crafting-recipes.js');

let testResults = {
  connection: false,
  spawn: false,
  inventory: false,
  axe_find: false,
  crafting_table: false,
  harvest: false,
  errors: []
};

console.log('\n' + '='.repeat(60));
console.log('🧪 WOOD HARVESTING DIAGNOSTIC TEST');
console.log('='.repeat(60) + '\n');

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'TestBot',
  version: false
});

bot.once('login', () => {
  console.log('✅ [1] Bot logged in successfully');
  testResults.connection = true;
});

bot.on('spawn', async () => {
  console.log('✅ [2] Bot spawned');
  testResults.spawn = true;

  try {
    await new Promise(r => setTimeout(r, 2000)); // Wait for full spawn

    // TEST 1: Check inventory
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

    // TEST 2: Check for axes
    console.log('\n🪓 TEST: Axe Detection');
    const bestAxe = getBestAxe(bot);
    if (bestAxe) {
      console.log(`   ✅ Found axe: ${bestAxe.name} x${bestAxe.count}`);
      testResults.axe_find = true;
    } else {
      console.log('   ⚠️  No axe found');
    }

    // TEST 3: Check for logs (find wood nearby)
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

    // TEST 4: Check crafting table
    console.log('\n🔨 TEST: Crafting Table');
    const craftingTableBlock = bot.findBlock({
      matching: b => b && b.name === 'crafting_table',
      maxDistance: 32,
      count: 1
    });
    
    if (craftingTableBlock) {
      console.log('   ✅ Crafting table found nearby');
      testResults.crafting_table = true;
    } else {
      console.log('   ⚠️  No crafting table found');
      console.log('   💭 Will try to create one during harvest...');
    }

    // TEST 5: Run actual harvest
    console.log('\n🪵 TEST: Running Harvest (1 log)');
    console.log('   Starting harvestWood(bot, 20, 1)...');
    
    try {
      const result = await harvestWood(bot, 20, 1);
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
  console.log(`Inventory:        ${testResults.inventory ? '✅' : '❌'}`);
  console.log(`Axe Detection:    ${testResults.axe_find ? '✅' : '❌'}`);
  console.log(`Crafting Table:   ${testResults.crafting_table ? '✅' : '⚠️ '}`);
  console.log(`Harvest:          ${testResults.harvest ? '✅' : '❌'}`);
  
  if (testResults.errors.length > 0) {
    console.log('\n⚠️  ERRORS:');
    testResults.errors.forEach(err => console.log(`   - ${err}`));
  }
  console.log('\n' + '='.repeat(60) + '\n');
}
