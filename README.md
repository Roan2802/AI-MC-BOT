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
- `!protect <spelernaam>` — Bot beschermt een speler (TODO)
- `!sethome` — Huislocatie opslaan
- `!home` — Bot gaat naar het huis
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

## Development

### Syntax Check
```bash
node --check bot.js commands/*.js src/*.js nlp/*.js utils/*.js
```

### Dependencies
- `mineflayer` ^4.13.0
- `mineflayer-pathfinder` ^2.2.0

## Licentie

MIT
