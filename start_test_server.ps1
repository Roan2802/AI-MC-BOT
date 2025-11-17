# Quick Start Test Server Script
# Run this to set up a minimal Minecraft server for testing

param(
    [string]$ServerVersion = "1.20.1"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Minecraft Test Server Setup ===" -ForegroundColor Cyan
Write-Host ""

# Check if Java is installed
try {
    $javaVersion = java -version 2>&1 | Select-String "version"
    Write-Host "✓ Java found: $javaVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Java not found! Please install Java 17 or higher." -ForegroundColor Red
    Write-Host "  Download from: https://adoptium.net/" -ForegroundColor Yellow
    exit 1
}

# Create server directory
$serverDir = "minecraft_server"
if (-not (Test-Path $serverDir)) {
    Write-Host "Creating server directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $serverDir | Out-Null
}

Set-Location $serverDir

# Download server JAR if not present
$serverJar = "server.jar"
if (-not (Test-Path $serverJar)) {
    Write-Host "Server JAR not found in $serverDir" -ForegroundColor Yellow
    Write-Host "Please download server.jar manually from:" -ForegroundColor Yellow
    Write-Host "  https://www.minecraft.net/en-us/download/server" -ForegroundColor Cyan
    Write-Host "Place it in the '$serverDir' folder and run this script again." -ForegroundColor Yellow
    Set-Location ..
    exit 1
}

# Create EULA
Write-Host "Creating eula.txt..." -ForegroundColor Yellow
"eula=true" | Out-File -FilePath "eula.txt" -Encoding ASCII

# Create server.properties
Write-Host "Creating server.properties..." -ForegroundColor Yellow
$properties = @"
server-port=25565
online-mode=false
gamemode=creative
difficulty=peaceful
spawn-protection=0
max-players=10
view-distance=10
enable-command-block=true
pvp=false
spawn-monsters=false
spawn-animals=true
level-name=bottest
"@
$properties | Out-File -FilePath "server.properties" -Encoding ASCII

Write-Host ""
Write-Host "=== Server configured! ===" -ForegroundColor Green
Write-Host ""
Write-Host "Starting server..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

# Start server
java -Xmx1024M -Xms1024M -jar server.jar nogui
