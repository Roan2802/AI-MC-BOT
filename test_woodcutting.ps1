# Woodcutting Test Script
# This script will spawn a test client and send woodcutting commands to the bot

Write-Host "=== Woodcutting Test Suite ===" -ForegroundColor Cyan
Write-Host ""

$testClient = @"
const mineflayer = require('mineflayer');

const tester = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'WoodTester'
});

let testStep = 0;
const tests = [
  { delay: 3000, cmd: '!status', desc: 'Check bot is responsive' },
  { delay: 2000, cmd: '!chop 5', desc: 'Chop 5 logs with replanting' },
  { delay: 15000, cmd: '!chop 10 planks', desc: 'Chop 10 logs and craft planks' },
  { delay: 15000, cmd: '!chop 8 sticks', desc: 'Chop 8 logs and craft sticks' },
  { delay: 2000, cmd: '!inventory', desc: 'Check inventory contents' }
];

tester.once('spawn', async () => {
  console.log('[WoodTester] Connected! Starting woodcutting tests...\n');
  
  for (const test of tests) {
    await new Promise(r => setTimeout(r, test.delay));
    console.log(`\n[Test] ${test.desc}`);
    console.log(`[Command] ${test.cmd}`);
    tester.chat(test.cmd);
  }
  
  await new Promise(r => setTimeout(r, 5000));
  console.log('\n[WoodTester] Tests complete! Check bot responses above.');
  tester.quit();
});

tester.on('chat', (username, message) => {
  if (username === 'Agent01') {
    console.log(`[Agent01] ${message}`);
  }
});

tester.on('error', (err) => console.error('[Error]', err.message));
tester.on('end', () => process.exit(0));

console.log('[WoodTester] Connecting...');
"@

# Save test client script
$testClient | Out-File -FilePath "temp_wood_test.js" -Encoding UTF8

# Run the test
Write-Host "Starting woodcutting tests..." -ForegroundColor Yellow
Write-Host "Watch the bot in Minecraft to see it chop trees!" -ForegroundColor Green
Write-Host ""

node temp_wood_test.js

# Cleanup
Remove-Item "temp_wood_test.js" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
