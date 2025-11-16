# AI-MC-BOT

Run with:

```bash
npm install
npm start
```

Ollama (optioneel)
-------------------
Je kunt optioneel een lokale Ollama-server gebruiken (bijv. model `qwen-2.5-7b`) voor natuurlijke taal-naar-intents. Start de bot met de environment-variabele `USE_OLLAMA=1` om de Ollama-integratie te activeren:

```bash
USE_OLLAMA=1 npm start
```

De parser probeert eerst Ollama via `http://localhost:11434/api/generate` aan te spreken. Als dat faalt, valt hij terug op een ingebouwde rule-based parser.

Zorg dat Ollama lokaal draait en dat het model `qwen-2.5-7b` beschikbaar is.

Nieuwe features
-------------
- GPS logging: de bot logt periodiek zijn positie naar `logs/gps.jsonl` (één JSON-object per regel). Gebruik `!gps` om recente posities in de chat te tonen.
- Home persistence: `!sethome` slaat de positie op naar `data/home.json`. `!home` brengt de bot terug naar die positie.


