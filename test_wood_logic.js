#!/usr/bin/env node
/**
 * Direct test of wood harvesting logic without Minecraft server
 * Tests the harvestWood function with a mock bot object
 */

console.log('[Test] Starting wood harvesting logic test...');

// Mock bot object with minimal required properties
const mockBot = {
  username: 'TestBot',
  entity: {
    position: { x: 0, y: 64, z: 0 },
    distanceTo: (pos) => Math.sqrt(
      Math.pow(pos.x - 0, 2) +
      Math.pow(pos.y - 64, 2) +
      Math.pow(pos.z - 0, 2)
    )
  },
  inventory: {
    items: () => [
      // Mock some logs
      { name: 'oak_log', count: 5 },
      { name: 'stick', count: 2 },
      { name: 'planks', count: 10 }
    ]
  },
  findBlock: (options) => {
    // Mock finding a log block
    if (options.matching && options.matching({ name: 'oak_log' })) {
      return {
        name: 'oak_log',
        position: { x: 10, y: 64, z: 10 }
      };
    }
    return null;
  },
  blockAt: (pos) => {
    // Mock block at position
    return {
      name: pos.y < 64 ? 'dirt' : 'air',
      diggable: pos.y < 64
    };
  },
  chat: (message) => {
    console.log(`[Mock Bot Chat] ${message}`);
  },
  equip: async (item, slot) => {
    console.log(`[Mock Bot] Equipped ${item.name} in ${slot}`);
  },
  unequip: async (slot) => {
    console.log(`[Mock Bot] Unequipped ${slot}`);
  },
  dig: async (block) => {
    console.log(`[Mock Bot] Digging ${block.name} at ${block.position.x}, ${block.position.z}`);
    return Promise.resolve();
  },
  lookAt: async (pos) => {
    console.log(`[Mock Bot] Looking at ${pos.x}, ${pos.y}, ${pos.z}`);
  },
  setControlState: async (control, state) => {
    console.log(`[Mock Bot] Set ${control} to ${state}`);
  },
  _debug: true
};

// Mock Vec3 class
class Vec3 {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  distanceTo(other) {
    return Math.sqrt(
      Math.pow(other.x - this.x, 2) +
      Math.pow(other.y - this.y, 2) +
      Math.pow(other.z - this.z, 2)
    );
  }

  minus(other) {
    return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z);
  }

  plus(other) {
    return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z);
  }

  normalize() {
    const length = this.distanceTo(new Vec3(0, 0, 0));
    return new Vec3(this.x / length, this.y / length, this.z / length);
  }

  scaled(factor) {
    return new Vec3(this.x * factor, this.y * factor, this.z * factor);
  }

  offset(dx, dy, dz) {
    return new Vec3(this.x + dx, this.y + dy, this.z + dz);
  }
}

// Make Vec3 available globally
global.Vec3 = Vec3;

// Load the wood harvesting module
try {
  const { harvestWood } = require('./src/wood.js');

  console.log('[Test] Loaded harvestWood function');
  console.log('[Test] Calling harvestWood with mock bot...');

  // Test the function
  harvestWood(mockBot, 20, 5, { replant: false, craftPlanks: false, craftSticks: false })
    .then((result) => {
      console.log(`[Test] ✅ harvestWood completed with result: ${result}`);
      console.log('[Test] Wood harvesting logic test passed!');
    })
    .catch((error) => {
      console.error('[Test] ❌ harvestWood failed:', error.message);
      console.error('[Test] Stack:', error.stack);
    });

} catch (error) {
  console.error('[Test] ❌ Failed to load wood module:', error.message);
  console.error('[Test] Stack:', error.stack);
}