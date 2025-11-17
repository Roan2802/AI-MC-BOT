# Bot Command Test Checklist

Test alle commands in de Minecraft chat. De bot moet reageren op elk command.

## Basic Commands
- [ ] `!status` - Should show position and health
- [ ] `!hello` - Should greet you
- [ ] `!stop` - Should stop all movement
- [ ] `!stay` - Should stay in place

## Movement Commands
- [ ] `!follow <yourname>` - Should follow you
- [ ] `!come <yourname>` - Should come to you once

## Mining/Gathering Commands
- [ ] `!mine oak_log` - Should mine nearby oak logs
- [ ] `!mine stone 5` - Should mine 5 stone blocks
- [ ] `!chop` - Should harvest wood
- [ ] `!chop 16` - Should harvest 16 wood blocks

## Crafting/Smelting Commands
- [ ] `!smelt` - Should smelt ores in furnace
- [ ] `!makecharcoal` - Should make charcoal from logs

## Expected Behaviors

### If command works:
- Bot responds in chat
- Bot performs the action
- Bot confirms completion

### If command fails:
- Bot should explain why (e.g., "Geen oven gevonden")
- Bot should not crash
- Bot should remain responsive

## Troubleshooting Notes

Write down any commands that:
1. Don't respond at all
2. Respond but don't work
3. Cause errors
4. Hang/freeze the bot
