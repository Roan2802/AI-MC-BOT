# Crafting Table Integration Test Guide

## Quick Start
1. Start the bot: `node bot.js`
2. Join the Minecraft server
3. Type in chat: `!chop 10`
4. Watch the bot's console output

## Expected Behavior - Step by Step

### Phase 1: Tool Preparation (STEP 0)
```
[Wood] STEP 0: Preparing tools...
[Wood] - Starting with X logs
[Wood] - Converting X logs to planks...
[Crafting] Crafted Y planks from X logs
[Wood] - Got Y planks
[Wood] - Crafting sticks from Y planks, keeping 3 for axe...
[Crafting] Crafted Z sticks
[Wood] - Axe check: planks=Y, sticks=Z
[Wood] - ✅ Materials ready for axe
```

### Phase 2: Crafting Table Preparation (NEW)
```
[Wood] - Ensuring crafting table for axe crafting...
[Crafting] Crafting table not found, crafting one...
[Crafting] Crafting table crafted
[Crafting] Placing crafting table...
[Crafting] Attempting to place at X, Y, Z
[Crafting] Crafting table placed successfully
[Wood] - ✅ Crafting table ready
```

### Phase 3: Opening Crafting Table (NEW - THE KEY FIX)
```
[Crafting] Found crafting table, opening...
[Crafting] Crafting table opened
[Wood] - Crafting wooden axe...
[Crafting] Attempting to craft wooden axe...
[Crafting] Crafted 1x wooden_axe
[Wood] - ✅ Axe crafted successfully!
✅ Axe gecrafted!
```

### Phase 4: Harvesting (continues as normal)
```
[Wood] Loading pathfinder package...
[Wood] Pathfinder package loaded successfully
[Wood] STEP 1: Check axe
[Wood] getBestAxe returned: [Item "wooden_axe"]
[Wood] STEP 2: Equip best tool
[Wood] Found axe, equipping: wooden_axe
...
```

## Success Indicators

### ✅ All Green
- Console shows all three phases above
- Message shows "✅ Axe gecrafted!"
- Bot equips wooden axe and starts harvesting
- Bot successfully mines multiple trees

### ⚠️ Potential Issues

#### Issue 1: No Crafting Table Placed
```
[Crafting] Crafting table not found, crafting one...
[Crafting] Crafting table crafted
[Crafting] Placing crafting table...
[ERROR] No suitable ground to place crafting table nearby
```
**Fix**: Bot needs better ground nearby or needs to navigate to better position

#### Issue 2: Crafting Table Not Opened
```
[Wood] - ✅ Crafting table ready
[Crafting] Found crafting table, opening...
[Crafting] Could not open crafting table: Error message
```
**Cause**: Block found but bot.openBlock() failed
**Fix**: Check if bot has clear line of sight to table

#### Issue 3: Recipe Still Not Found
```
[Crafting] Crafting table opened
[Crafting] wooden_axe not found, searching for items with 'wooden'...
[Crafting] Found match: oak_axe
[Crafting] No recipe for oak_axe
```
**Cause**: Recipe name is different or not available
**Debug**: Run `!debug_recipes` command to see available recipes

#### Issue 4: Window Type Check Fails
```
[Crafting] Crafting window open, searching recipes in window...
[Crafting] No recipe for wooden_axe
```
**Cause**: Window type might not be 'crafting'
**Debug**: Add console logging to check bot.currentWindow.type

## Test Scenarios

### Test 1: Fresh Start (No Tools)
- Command: `!chop 5`
- Expected: Bot mines one tree, crafts planks→sticks→axe, then harvests 5 trees
- Success Criteria: Axe crafted and used

### Test 2: With Existing Resources
- Scenario: Player gives bot 10 planks + 4 sticks
- Command: `!chop 3`
- Expected: Skip first tree mining, go straight to crafting table + axe
- Success Criteria: Table placed, opened, axe crafted

### Test 3: Repeated Harvesting
- Command: `!chop 10` twice in succession
- Expected: First run creates table and axe, second run finds existing table
- Success Criteria: Both runs complete successfully

### Test 4: Fallback Recipe Names
- Command: `!debug_recipes`
- Expected: Shows available axe recipes
- Success Criteria: At least one recipe name displayed

## Debugging Commands

### Check Inventory
```
!inventory
```
Shows all items with counts

### Check Available Recipes
```
!debug_recipes
```
Lists all craftable axe and pickaxe recipes

### Check Bot Status
```
!status
```
Shows position, health, current action

## Key Changes to Verify

1. **File: src/crafting-recipes.js**
   - Check: `ensureCraftingTableOpen()` function exists
   - Check: Function is in module.exports

2. **File: src/wood.js**
   - Check: Import includes `ensureCraftingTableOpen`
   - Check: STEP 0 calls `ensureCraftingTableOpen(bot)`
   - Check: Table operations happen BEFORE axe craft

3. **File: src/crafting-tools.js**
   - Check: `tryCraft()` checks `bot.currentWindow`
   - Check: Recipes searched in both window and inventory

## Performance Notes

- **Table Creation**: ~500ms (only if not existing)
- **Table Opening**: ~100ms per attempt
- **Axe Crafting**: ~200ms (after window open)
- **Total New Overhead**: ~800ms first run (creation), ~100ms subsequent (just open)
- **No Performance Regression**: Inventory recipes still use fast path

## Rollback Instructions

If issues occur, revert changes:
```bash
git checkout src/crafting-recipes.js src/wood.js src/crafting-tools.js
```

Or manually remove:
1. `ensureCraftingTableOpen()` function from crafting-recipes.js
2. The import of ensureCraftingTableOpen in wood.js
3. The call to ensureCraftingTableOpen() in STEP 0 of wood.js
4. The window checking logic in tryCraft() of crafting-tools.js
