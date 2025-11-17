# 🤖 Bot Test Plan - Complete Feature Validation

## ✅ PRIORITY 1: Basic Commands (Test First)

### Status & Info
```
!status          → Should show position (X, Y, Z) and health
!hello           → Should respond with greeting
!inventory       → Should show inventory status
```

### Movement Control
```
!stop            → Stop all movement immediately
!stay            → Stay in current position
!follow <name>   → Follow player continuously
!come <name>     → Come to player once
```

## ⛏️ PRIORITY 2: Mining & Resource Gathering

### Wood Gathering
```
!chop            → Harvest 32 wood blocks (default)
!chop 16         → Harvest 16 wood blocks
!mine oak_log    → Mine single oak log
!mine oak_log 5  → Mine 5 oak logs
```

**Expected behavior:**
- Bot should look for nearby trees
- Equip axe if available, otherwise craft one
- Break wood blocks
- Collect drops
- Report how many blocks gathered

### Stone/Ore Mining
```
!mine stone      → Mine 1 stone block
!mine stone 10   → Mine 10 stone blocks
!mine iron_ore 5 → Mine 5 iron ore
!mine coal_ore   → Mine coal ore
```

**Expected behavior:**
- Bot should look for stone/ore nearby
- Craft pickaxe if needed (wooden → stone → iron progression)
- Mine blocks
- Collect drops
- Report results

## ⚔️ PRIORITY 3: Combat System

### Combat Commands
```
!protect <name>  → Protect player from mobs
!attack <mob>    → Attack specific mob type
```

**Test scenarios:**
1. Spawn zombie near bot → Should auto-attack
2. Spawn creeper near bot → Should evade and attack
3. Spawn skeleton → Should approach and attack
4. Multiple mobs → Should prioritize threats

**Expected behavior:**
- Auto-detect hostile mobs within 12 blocks
- Equip best weapon (sword > axe)
- Attack mobs efficiently
- Evade creepers when close
- Protect player if commanded

## 🔧 PRIORITY 4: Crafting & Smelting

### Crafting
```
!craft pickaxe   → Craft pickaxe (auto-selects best available)
!craft sword     → Craft sword
!craft furnace   → Craft furnace
```

### Smelting
```
!smelt           → Smelt all ores in nearby furnace
!makecharcoal    → Make charcoal from logs
```

## 📋 Testing Checklist

### Phase 1: Basic Functionality
- [ ] !status works
- [ ] !hello works
- [ ] !stop works
- [ ] Bot responds to all commands

### Phase 2: Resource Gathering
- [ ] !chop works (gathers wood)
- [ ] !mine oak_log works
- [ ] !mine stone works
- [ ] !mine iron_ore works
- [ ] Bot crafts tools when needed
- [ ] Bot reports gathered amounts

### Phase 3: Combat
- [ ] Bot auto-attacks zombies
- [ ] Bot attacks skeletons
- [ ] Bot evades creepers
- [ ] !protect command works
- [ ] Bot equips best weapon

### Phase 4: Advanced Features
- [ ] !smelt works
- [ ] !makecharcoal works
- [ ] !craft commands work
- [ ] !follow works smoothly
- [ ] !come works

## 🐛 Bug Report Template

When a command fails, note:
```
Command: !mine stone
Expected: Bot mines stone and reports count
Actual: [What happened]
Error: [Any chat message from bot]
Console: [Any error in terminal]
```

## 🎯 Success Criteria

**Minimum Viable Bot:**
- ✅ All basic commands work (!status, !hello, !stop)
- ✅ Wood gathering works (!chop, !mine oak_log)
- ✅ Stone mining works (!mine stone)
- ✅ Basic combat works (auto-attacks zombies)

**Full Feature Bot:**
- ✅ All resource gathering works
- ✅ All mining works (wood, stone, iron, coal)
- ✅ Combat system fully functional
- ✅ Crafting and smelting works
- ✅ Movement commands reliable

## 🔄 Test Now

Start testing in Minecraft with:
1. !status
2. !hello  
3. !chop
4. !mine stone

Report what works/fails and I'll fix it!
