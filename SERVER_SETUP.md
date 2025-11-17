# Minecraft Test Server Setup

## Quick Start

1. **Download Minecraft Server** (if not already done):
   - Go to https://www.minecraft.net/en-us/download/server
   - Download the latest server JAR file
   - Place it in a folder named `minecraft_server`

2. **Create server folder structure**:
   ```powershell
   mkdir minecraft_server
   cd minecraft_server
   ```

3. **Accept EULA**:
   Create a file named `eula.txt` with content:
   ```
   eula=true
   ```

4. **Create server.properties** with these settings:
   ```properties
   server-port=25565
   online-mode=false
   gamemode=creative
   difficulty=peaceful
   spawn-protection=0
   max-players=10
   view-distance=10
   ```

5. **Start the server**:
   ```powershell
   java -Xmx1024M -Xms1024M -jar server.jar nogui
   ```

## Alternative: Quick Test Script

Run the included `start_test_server.ps1` to automatically set up and start a test server.

## Testing the Bot

Once the server is running:

```powershell
cd ..
node bot.js
```

The bot should connect to localhost:25565 and spawn in the world.

## Commands to Test

In Minecraft chat, try:
- `!status` - Check bot position and health
- `!hello` - Greet the bot
- `!follow <yourname>` - Make bot follow you
- `!stop` - Stop all movement
- `!mine oak_log` - Mine nearby oak logs

## Troubleshooting

- **"Connection refused"**: Server not running or wrong port
- **"Timed out"**: Server starting up, wait a moment and retry
- **Module errors**: Run `node test_modules.js` first to verify all modules load
