# AI-MC-BOT

Modulaire Minecraft-bot met Mineflayer, Pathfinding, Mining, Natural Language Processing (NLP) en meer.

## Installatie

```bash
npm install
npm start
```

De bot maakt verbinding met een lokale Minecraft-server op `localhost:25565` als `Agent01`.

## Hard Commands

Alle commando's kunnen direct worden gegeven door `!` vooraan te zetten:

- `!status` — Toon huidige positie en gezondheid
- `!hello` — Begroeting van de bot
- `!follow <spelernaam>` — Bot volgt een speler (continu)
- `!come <spelernaam>` — Bot navigeert naar een speler
- `!stay` — Bot blijft op huidige plek staan
- `!mine [bron]` — Bot zoekt en mined resource (standaard: oak_log)
- `!chop` — Hak hout in de buurt (whole-tree felling)
- `!smelt` — Smelt beschikbare ertsen in oven (craft/place oven if needed)
- `!makecharcoal` — Maak charcoal van logs (bestift fuel)
- `!mineores` — Mijn meerdere ertsen (vein-mining)
- `!makestonepickaxe` — Craft stone pickaxe (upgrade)
- `!makeironpickaxe` — Craft iron pickaxe (vereist ijzer ingots)
- `!makekelpblock` — Droog kelp en maak dried_kelp_blocks
- `!fueljobs` — Start geautomatiseerde bulk brandstof-productie
- `!fuelqueue` — Toon status van brandstof job queue
- `!protect <spelernaam>` — Bot beschermt een speler (TODO)
- `!sethome` — Huislocatie opslaan
- `!home` — Bot gaat naar het huis
- `!store` — Ga naar huis en sla items op (best-effort)
- `!gps` — Logga huidge positie naar logs/gps.jsonl
- `!stop` — Stop alle beweging onmiddellijk
- `!help` — Toon beschikbare commando's

## Natural Language (NLP)

De bot begrijpt Nederlandse zinnen! Spreek de bot aan met "agent" of "agent01":

Voorbeelden:
- `"agent, volg mij"` → Volg de spreker
- `"agent, kom hier"` → Navigeer naar de spreker
- `"agent, blijf hier"` → Stop en blijf staan
- `"agent, hak hout"` → Mijn oak_log
- `"agent, onthoud deze plek"` → Stel huis in
- `"agent, ga naar de basis"` → Navigeer naar opgeslagen huis

### Met Ollama AI (optioneel)

Voor geavanceerde NLP met het `qwen-2.5-7b` model:

```bash
# Terminal 1: Start Ollama server
ollama run qwen-2.5-7b

# Terminal 2: Start bot met Ollama
USE_OLLAMA=1 npm start
```

## Architectuur

### Core Modules

- **bot.js** — Entry point, bot initialisatie en spawn handler
- **commands/commandRouter.js** — Routes hard commands (!) en NLP naar builtin commands
- **commands/builtinCommands.js** — Alle command implementaties met JSDoc
- **src/movement.js** — Pathfinding en navigatie (follow, come, move, stay)
- **src/mining.js** — Resource scanning en harvesting
- **src/memory.js** — Home positie persistentie (data/home.json)
- **src/navigation.js** — Geavanceerde navigatie met retry/timeout logic
- **nlp/intentParser.js** — NLP parser: rule-based + optionele Ollama AI
- **utils/logger.js** — Logging utilities met [Agent01] prefix
- **utils/safety.js** — Veiligheidschecks (lava, valputten)

## Features

✅ **Pathfinding** — Mineflayer-pathfinder integration  
✅ **Movement** — Follow players, navigate, stay in place  
✅ **Mining** — Automatic resource scanning and harvesting  
✅ **Persistence** — Home position save/load  
✅ **NLP** — Rule-based Dutch language parsing  
✅ **Ollama** — Optional AI-powered NLP (qwen-2.5-7b)  
✅ **GPS Logging** — JSON-lines format position tracking  
✅ **Modular** — Clean separation of concerns  
✅ **JSDoc** — Full function documentation  

## Toekomstige Extensies (TODO)

- **Combat**: Mobs aanvallen, spelers beschermen
- **Building**: Blokken plaatsen, structuren bouwen
- **Farming**: Gewassen oogsten en herbeplanten

## Gebruik

### Starten
```bash
npm start
```

### Met Ollama
```bash
USE_OLLAMA=1 npm start
```

### Quick Test Setup

**Vereisten:**
- Minecraft server (localhost:25565) of gebruiken van [Docker Minecraft](https://hub.docker.com/r/itzg/minecraft-server)
- Node.js 16+

**Test Stappen:**

1. **Start bot:**
```bash
npm start
```

2. **Join server als speler (e.g., Steve) en test commando's:**

```
!hello                    # Groet van bot
!status                   # Toon positie & health
!sethome                  # Sla huislocatie op
!chop                     # Hak hout (zoekt dichtbijzijnde boom)
!makecharcoal             # Maak charcoal (vereist furnace & fuel)
!mineores                 # Mijn ertsen (vein-mining)
!makestonepickaxe         # Upgrade naar stone pickaxe
!smelt                    # Smelt ores naar ingots
!store                    # Ga naar huis en sla spullen op
!follow Steve             # Volg speler Steve
!come Steve               # Kom naar speler
!stop                     # Stop beweging
```

3. **Batch Fuel Production (Resource MVP demo):**

```
!fueljobs                 # Analyze inventory → plan → execute batch jobs
!fuelqueue                # Check queue status
```

4. **Natural Language (optioneel):**

```
agent, volg mij           # NLP: volg
agent, hak hout           # NLP: chop
agent, ga naar huis       # NLP: home
```

### Syntax Check
```bash
node --check bot.js commands/*.js src/*.js nlp/*.js utils/*.js
```

### Dependencies
- `mineflayer` ^4.13.0
- `mineflayer-pathfinder` ^2.2.0

## Licentie

MIT
