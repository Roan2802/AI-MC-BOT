#!/usr/bin/env node
/**
 * Mock Minecraft Server for Testing
 * Simulates a Minecraft server so we can test the bot without needing actual Minecraft
 * 
 * Provides:
 * - Server login/auth
 * - Basic command routing
 * - Chat relay
 * - Fake game state
 */

const net = require('net');
const { EventEmitter } = require('events');

console.log('[Mock Server] Starting...');
console.log('[Mock Server] Listening on localhost:25565');
console.log('[Mock Server] Waiting for bot connection...\n');

// Create TCP server
const server = net.createServer((socket) => {
  console.log('[Mock Server] ✅ Bot connected from', socket.remoteAddress);
  
  // Store bot state
  const bot = {
    username: 'Agent01',
    health: 20,
    position: { x: 0, y: 64, z: 0 },
    dimension: 'minecraft:overworld'
  };

  // Send login success message
  socket.write('LOGIN_SUCCESS\n');
  socket.write('SPAWN\n');
  socket.write('BOT_SPAWNED\n');
  
  console.log('[Mock Server] Bot logged in as:', bot.username);
  console.log('[Mock Server] Ready for commands!\n');

  // Handle incoming data
  socket.on('data', (data) => {
    const message = data.toString().trim();
    
    if (message === '') return;
    
    console.log(`[Chat] ${bot.username}: ${message}`);
    
    // Echo back for testing
    socket.write(`CHAT_ACK:${message}\n`);
    
    // Simulate responses
    if (message.includes('!status')) {
      console.log('[Mock Server] Status requested');
      socket.write(`STATUS:${JSON.stringify(bot)}\n`);
    }
    else if (message.includes('!chop')) {
      console.log('[Mock Server] Chop command received');
      socket.write('CHOP_START\n');
      setTimeout(() => {
        socket.write('CHOP_COMPLETE:5\n');
        console.log('[Mock Server] Chop simulation complete');
      }, 2000);
    }
    else if (message.includes('!hello')) {
      console.log('[Mock Server] Hello command received');
      socket.write('HELLO_RESPONSE\n');
    }
  });

  socket.on('end', () => {
    console.log('\n[Mock Server] ⚠️ Bot disconnected');
  });

  socket.on('error', (err) => {
    console.error('[Mock Server] Socket error:', err.message);
  });
});

server.listen(25565, 'localhost', () => {
  console.log('[Mock Server] TCP server listening on port 25565\n');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('[Mock Server] ❌ Port 25565 is already in use!');
    console.error('[Mock Server] Please close the other server or change port');
    process.exit(1);
  }
  throw err;
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Mock Server] Shutting down...');
  server.close(() => {
    console.log('[Mock Server] Server closed');
    process.exit(0);
  });
});
