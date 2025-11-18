# Autonomous Mining & Ore Harvesting System Plan

Scope: Implement a robust, safe, configurable mining subsystem that can (a) acquire and maintain proper pickaxes, (b) discover and mine targeted ores and stone, (c) perform progressive tunnel / branch mining, (d) manage inventory & storage handoff, (e) avoid hazards (lava, falls, suffocation), (f) recover from stuck states, and (g) expose clear commands / APIs.

---
## 1. Objectives
- Mine specified resource types: `stone`, common ores (`coal`, `iron`, `copper`, `lapis`, `redstone`, `gold`, `diamond`, `emerald`).
- Support strategies: surface ore collection, vein mining, vertical shaft, staircase mining, branch mining (main tunnel + side branches), selective ore prioritization.
- Automatic crafting of pickaxes (wood → stone → iron → diamond) with fallback logic.
- Safety-first: do not mine blocks that will cause gravel/sand collapse, lava flow, or player fall > configured height.
- Autonomous lighting (torches) to reduce mob spawns (optional toggle).
- Inventory management: auto-smelt optional (future), drop overflow, return to base / chest deposit.

---
## 2. High-Level Architecture
Modules (new / extended):
1. `mining-core.js` — Orchestrates mining tasks, strategy execution state machine.
2. `mining-strategies.js` — Implements algorithms: surface scan, vein mine, staircase, branch pattern.
3. `mining-safety.js` — Hazard detection & preventative actions.
4. `mining-tools.js` — Pickaxe lifecycle: ensure/craft/upgrade, durability monitoring.
5. `mining-navigation.js` — Pathfinding helpers specialized for underground (avoid liquids, handle tunnels).
6. `mining-inventory.js` — Inventory thresholds, chest deposit, discard low-value blocks (e.g., excess cobblestone if configured).
7. `mining-lighting.js` — Torch placement heuristic (every N blocks / at dark junctions) (optional).
8. `mining-recovery.js` — Stuck detector enhancements, backtracking, pillar removal.
9. `mining-config.js` — Single source for tunable parameters.
10. `mining-state.js` — Structured object for current task progress, branch counters, depth.

Existing integration points:
- Reuse `ensureToolForBlock`, extend for ore hardness tier mapping.
- Tie into global stuck detection (`movement.js`) but add mining-specific signals (e.g. blocked tunnel).

---
## 3. Configuration (mining-config.js)
```js
const defaultMiningConfig = {
  maxDepth: 35,              // y-level floor before stopping (e.g. for diamond adjust)
  targetYForDiamond: 12,      // staircase target level for diamond search
  branchInterval: 6,          // main corridor length between branch pairs
  branchLength: 12,           // length of each side branch
  torchSpacing: 8,            // place torch every N blocks (if lighting enabled)
  enableLighting: true,
  enableVeinExpansion: true,  // flood-fill ore clusters
  safeFallHeight: 4,          // do not step/dig into > safeFallHeight drops
  lavaAvoidRadius: 1,         // radius to scan around target block for lava
  gravelSandSupport: true,    // pre-check for gravity blocks overhead
  inventoryFullSlots: 4,      // remaining slots trigger deposit
  repairThreshold: 3,         // if pickaxe durability < threshold attempt upgrade/new
  allowedOres: [ 'coal', 'iron', 'copper', 'lapis', 'redstone', 'gold', 'diamond', 'emerald' ],
  priorityOres: [ 'diamond', 'iron', 'redstone', 'lapis' ],
  skipIfNoOreWithin: 120000,  // ms of searching before abort
  branchYStopAboveLava: true, // if lava at branch = shorten / skip
  maxSessionDuration: 1800000 // 30 min
}
module.exports = { defaultMiningConfig }
```

---
## 4. Tool Lifecycle (mining-tools.js)
Responsibilities:
- Determine required pickaxe tier: map ore → tier (wood=0, stone=1, iron=2, diamond=3).
- `ensurePickaxeFor(oreName)` decides crafting path:
  1. If inventory has >= required tier pickaxe → equip.
  2. Else try upgrade sequence: craft sticks → craft planks (if needed) → craft stone pick (furnace route for iron? smelting optional phase) → craft iron pick when iron + furnace + fuel are available → diamond pick if diamonds present (optional).
- Durability monitoring: listen to `playerCollect` or inventory updates; mineflayer provides metadata (or approximate by count of blocks mined). When low → preemptively craft replacement.
- Safe crafting environment: place crafting table (and furnace if iron upgrade) then remove after use.

APIs:
```js
async function ensurePickaxeFor(bot, blockName) {}
function pickaxeTier(itemName) {}
function requiredTierForBlock(blockName) {}
async function craftPickaxe(bot, tier) {}
```

---
## 5. Safety System (mining-safety.js)
Checks before each dig:
1. Lava proximity: scan 6 orthogonal neighbors & one below target; if lava or flowing_lava → skip or bucket (future).
2. Fall risk: if removing block exposes vertical drop > safeFallHeight → either place temporary block or skip.
3. Gravel/Sand collapse: if target block removal supports gravity blocks overhead chain (scan up to 4 blocks above). If unstable and no support plan, skip.
4. Water flooding: optional — avoid opening water pockets unless configured.
5. Suffocation detection: after move/dig, ensure head block is air.
6. Torch placement: if light level < threshold and torch in inventory → place on side wall or floor.
7. Mob proximity (future): if hostile mob within 6 blocks and mining path blocked → pause mining / combat.

APIs:
```js
function isBlockSafeToMine(bot, block) {}
async function performSafetyPreDig(bot, block) {}
async function placeTorchIfNeeded(bot) {}
```

---
## 6. Navigation Helpers (mining-navigation.js)
Features:
- Path to target block while minimizing digging (prefer existing air blocks).
- Tunnel creation: for staircase or branch, sequentially mine chosen pattern of blocks ahead.
- Backtracking: store breadcrumb positions (stack) to retreat to main corridor or entrance.
- Prevent diagonal carving: keep walls intact for orientation.
- Detect and correct sloping errors (ensure staircase step pattern 1 down + forward).

APIs:
```js
async function gotoBlock(bot, position, range=2) {}
async function digAndAdvance(bot, directionVec3) {}
function pushBreadcrumb(state, pos) {}
async function backtrack(bot, state, steps) {}
```

---
## 7. Mining Strategies (mining-strategies.js)
### 7.1 Surface Scan & Vein Mining
- Find nearest ore block within radius using existing `bot.findBlock`.
- Call `mineVein()` (extended) with improved safe dig logic.
- If priority ore found mid-task, switch strategy temporarily.

### 7.2 Staircase Descent
- From surface to `targetYForDiamond`.
- Pattern: mine forward block + downward block to create 2-block high descending corridor.
- Safety: orthogonal lava check each step; abort descent if repeated lava pockets (>N occurrences).

### 7.3 Branch Mining
- Main horizontal corridor at target Y.
- Every `branchInterval` blocks carve left & right branches of `branchLength`.
- While carving branch: opportunistically vein mine discovered ores.
- Maintain branch count; stop when inventory near full or time exceeded.

### 7.4 Opportunistic Ore Intercept
- While executing corridor dig, scan small radius (e.g., 4) for high-priority ores behind one layer of stone; dig minimal approach path.

### 7.5 Adaptive Strategy Selection
- Start with staircase if at surface (y > target). Otherwise branch mining.
- If priority ore scarcity after `skipIfNoOreWithin` ms → widen corridor or switch to exploratory spiral.

APIs:
```js
async function runStaircase(bot, state, config) {}
async function runBranchMining(bot, state, config) {}
async function runSurfaceOres(bot, state, config) {}
async function adaptStrategy(bot, state, config) {}
```

---
## 8. State Management (mining-state.js)
State object example:
```js
const miningState = {
  mode: 'staircase' | 'branch' | 'surface' | 'vein' | 'idle',
  startedAt: Date.now(),
  lastOreTimestamp: Date.now(),
  minedBlocks: 0,
  minedOres: 0,
  branchIndex: 0,
  mainCorridorLength: 0,
  breadcrumb: [],
  entrancePos: null,
  currentY: null,
  abortReason: null
}
```
Functions:
- `initMiningState(bot)` sets entrance & y.
- `updateAfterDig(block)` increments counters & classification.
- `markOreFound()` refreshes lastOreTimestamp.

---
## 9. Inventory & Storage (mining-inventory.js)
Responsibilities:
- Check free slots: `bot.inventory.emptySlotCount()`.
- If free slots < config.inventoryFullSlots → trigger deposit routine.
Deposit Routine (basic):
1. Backtrack to entrance or configured chest coordinate.
2. Find chest block, open, transfer ores & stone (keep minimal stack).
3. If no chest: optionally craft chest (if planks available) place, deposit, pick chest back (configurable).

Optional: auto-smelt iron/gold if furnace + fuel available (phase 2).

APIs:
```js
function needsDeposit(bot, config) {}
async function depositInventory(bot, state, config) {}
function classifyItem(item) { return 'ore'|'stone'|'utility'|'other' }
```

---
## 10. Lighting (mining-lighting.js)
Heuristic:
- Maintain step counter since last torch; if > torchSpacing or light level < threshold → place.
- Light-level reading: using block light value at feet (if available via prismarine-block). If not accessible, approximation via time since last placement.
- Placement target: floor block ahead or wall on right side.

APIs:
```js
async function maybePlaceTorch(bot, state, config) {}
```

---
## 11. Recovery (mining-recovery.js)
Additions beyond global stuck detection:
- Detect zero horizontal progress during corridor dig (positions differ only by Y over 5 checks) → attempt lateral sidestep & resume.
- Sand/gravel fall reaction: if gravity block falls near bot head → step back 2 blocks, re-evaluate.
- Lava breach: place temporary cobblestone in front; if bucket present maybe collect (future).
- Dead-end resolution: if branch mined fully and no ores found → fill last hole optionally (to avoid confusion) or mark visited.

APIs:
```js
async function handlePotentialStuck(bot, state, config) {}
async function mitigateLava(bot, position) {}
```

---
## 12. Command / Public API Layer
Add commands (in `commands/builtinCommands.js`):
- `!mine start [strategy] [ore]` → begin mining session.
- `!mine stop` → abort safely, backtrack to entrance.
- `!mine status` → report mined blocks, ores, elapsed time.
- `!mine config key value` → adjust runtime config (e.g., torchSpacing).

Public API exports (`mining-core.js`):
```js
async function startMining(bot, options) {}
async function stopMining(bot) {}
function getMiningStatus(bot) {}
```

---
## 13. Detailed Step Flow (Example StartMining)
1. Validate not already mining.
2. Load / merge config overrides.
3. Ensure minimum tool (stone pick) via `ensurePickaxeFor('stone')`.
4. Initialize state (`initMiningState`).
5. If surface (y > targetYForDiamond): `mode='staircase'`; else `mode='branch'`.
6. Loop:
   - Check abort conditions (time, inventory, low durability with no upgrade path).
   - Safety pre-step (lava, fall, suffocation).
   - Strategy dispatcher: run current mode step function (one atomic chunk of mining action).
   - After dig, update state, maybe place torch, maybe adapt strategy.
   - If ore vein encountered: temporarily switch `mode='vein'`, execute `mineVeinExtended`, then revert to previous.
   - Recovery checks.
7. On stop or abort: backtrack to entrance; optional deposit.
8. Report summary via chat.

---
## 14. Extended Vein Mining (Improvements)
- Use BFS flood-fill including diagonals for ore clusters but limit size to prevent giant cavity.
- Surround block safety: if adjacent block is lava, skip that branch of vein.
- Prefer top-down or nearest-first to minimize exposing drops.

---
## 15. Data Structures / Utilities
- Direction vectors: `{x:1,y:0,z:0}` etc for corridor progression.
- Queue for vein BFS.
- Breadcrumb stack: array of Vec3 clones.
- Simple event bus (optional) for mining events: `onOreFound`, `onToolUpgrade`, `onHazard`.

---
## 16. Edge Cases & Handling
| Case | Handling |
|------|----------|
| No ores found for long | Switch from branch → exploratory widening or stop with message. |
| Inventory full mid-vein | Finish current ore block, then deposit routine. |
| Pickaxe breaks during dig | Immediate `ensurePickaxeFor` call; if fail, stop. |
| Lava reveals below after dig | Step back, place block, mark hazardous region, avoid next time. |
| Water flows in | Attempt block placement; if not possible, adjust route. |
| Torch supply exhausted | Disable lighting gracefully. |

---
## 17. Implementation Phases
Phase 1: Core + Staircase + Basic Vein + Safety minimal (lava, fall) + Tool ensure.
Phase 2: Branch mining + Lighting + Inventory deposit.
Phase 3: Advanced safety (gravel support, water mitigation) + Strategy adaptation.
Phase 4: Config commands + Recovery enhancements + Auto-smelt.

---
## 18. Metrics & Logging
Log prefixes: `[MiningCore]`, `[MiningSafety]`, `[MiningTools]` etc.
Counters: minedBlocks, minedOres, torchesPlaced, hazardsAvoided.
Periodic status broadcast (every 2–3 minutes) or on `!mine status`.

---
## 19. Security & Performance Considerations
- Avoid scanning huge volumes each tick; use incremental scan windows.
- Cache last found ore positions to prevent repeated full-radius scans.
- Debounce crafting to prevent repeated window open/close loops.
- Use configurable limits to avoid runaway mining (maxSessionDuration).

---
## 20. Next Steps (Implementation Order)
1. Create `mining-config.js`, `mining-state.js`, `mining-tools.js` (basic ensure pickaxe).
2. Implement `startMining`, `stopMining` skeleton with staircase strategy only.
3. Extend with vein mining & safety checks.
4. Add branch mining pattern & lighting.
5. Add deposit & recovery modules.
6. Add commands & dynamic config adjustments.

---
This plan is the blueprint. We will proceed implementing Phase 1 components next.
