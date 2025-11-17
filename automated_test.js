/**
 * Automated Bot Testing Script
 * Tests all commands systematically and reports results
 */

const mineflayer = require('mineflayer');

// Create a test client that will send commands
const tester = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'Tester',
  version: false
});

const testResults = [];
let currentTest = 0;

const tests = [
  { name: 'Basic - Status', command: '!status', expectedResponse: 'Positie:' },
  { name: 'Basic - Hello', command: '!hello', expectedResponse: 'Hallo' },
  { name: 'Basic - Stop', command: '!stop', expectedResponse: 'Stop' },
  { name: 'Movement - Stay', command: '!stay', expectedResponse: 'blijf' },
  { name: 'Movement - Follow', command: '!follow Tester', expectedResponse: 'volg' },
  { name: 'Info - Inventory', command: '!inventory', expectedResponse: /inventory|leeg|slots/i },
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

tester.once('spawn', async () => {
  console.log('[Tester] Connected! Starting automated tests...\n');
  await delay(2000); // Wait for bot to be ready

  for (const test of tests) {
    currentTest++;
    console.log(`\n[Test ${currentTest}/${tests.length}] ${test.name}`);
    console.log(`  Command: ${test.command}`);
    
    let passed = false;
    let response = '';
    
    // Listen for chat response
    const chatListener = (username, message) => {
      if (username === 'Agent01') {
        response += message + ' ';
        if (typeof test.expectedResponse === 'string') {
          if (message.includes(test.expectedResponse)) passed = true;
        } else if (test.expectedResponse instanceof RegExp) {
          if (test.expectedResponse.test(message)) passed = true;
        }
      }
    };
    
    tester.on('chat', chatListener);
    
    // Send command
    tester.chat(test.command);
    
    // Wait for response (max 5 seconds)
    await delay(5000);
    
    tester.off('chat', chatListener);
    
    // Report result
    if (passed) {
      console.log(`  ✅ PASS - Response: ${response.trim()}`);
      testResults.push({ test: test.name, status: 'PASS', response });
    } else {
      console.log(`  ❌ FAIL - Response: ${response.trim() || 'No response'}`);
      testResults.push({ test: test.name, status: 'FAIL', response: response || 'No response' });
    }
    
    // Wait between tests
    await delay(2000);
  }
  
  // Print summary
  console.log('\n\n=== TEST SUMMARY ===');
  const passed = testResults.filter(r => r.status === 'PASS').length;
  const failed = testResults.filter(r => r.status === 'FAIL').length;
  console.log(`Passed: ${passed}/${tests.length}`);
  console.log(`Failed: ${failed}/${tests.length}`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    testResults.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.test}`);
    });
  }
  
  console.log('\n[Tester] Tests complete! Disconnecting...');
  tester.quit();
  process.exit(failed > 0 ? 1 : 0);
});

tester.on('error', (err) => {
  console.error('[Tester] Error:', err.message);
  process.exit(1);
});

tester.on('end', () => {
  console.log('[Tester] Disconnected');
});

console.log('[Tester] Connecting to server...');
