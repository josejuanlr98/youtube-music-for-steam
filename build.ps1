# build.ps1 — Build and package YouTube Music for Decky Loader
# Usage: powershell -ExecutionPolicy Bypass -File build.ps1
# Or:    pnpm run package

$ErrorActionPreference = "Stop"

$PluginName = "YouTube Music"   # Must match plugin.json "name" exactly
$ZipSlug   = "youtube-music-for-steam"  # Used for the output ZIP filename
$NodeVersion = "v22.23.3"
$NodeUrl = "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-linux-x64.tar.xz"
$YtdlpVersion = "2026.08.19"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonModulesDir = Join-Path $ScriptDir "py_modules"
$BinDir = Join-Path $ScriptDir "bin"
$StagingDir = Join-Path $ScriptDir "staging"
$PluginDir = Join-Path $StagingDir $PluginName
$ZipPath = Join-Path $ScriptDir "$ZipSlug.zip"

Write-Host "=== YouTube Music + Cast Build Script ===" -ForegroundColor Cyan

# --- Step 1: Install dependencies ---
Write-Host "`n[1/6] Installing dependencies..." -ForegroundColor Yellow
Push-Location $ScriptDir
pnpm install
if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
Pop-Location

# --- Step 1b: Install Python runtime dependencies ---
Write-Host "`n[1b/6] Installing Python dependencies..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $PythonModulesDir -Force | Out-Null
python -m pip install --disable-pip-version-check --upgrade --target $PythonModulesDir -r (Join-Path $ScriptDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Python dependency install failed" }
# pip --target can leave metadata from an older version after replacing its code.
$ResolvedModules = [IO.Path]::GetFullPath($PythonModulesDir).TrimEnd('\') + '\'
Get-ChildItem -LiteralPath $PythonModulesDir -Directory -Filter "ytmusicapi-*.dist-info" | Where-Object { $_.Name -ne "ytmusicapi-1.12.3.dist-info" } | ForEach-Object {
    $OldMetadata = [IO.Path]::GetFullPath($_.FullName)
    if (!$OldMetadata.StartsWith($ResolvedModules, [StringComparison]::OrdinalIgnoreCase)) { throw "Unexpected dependency metadata path" }
    Remove-Item -LiteralPath $OldMetadata -Recurse -Force
}

# Cookie import uses Firefox-family SQLite profiles and needs no OS keyring.
# Remove leftovers from earlier Chromium-enabled builds before packaging.
foreach ($OldModule in @("browser_cookie3", "browser_cookie3-0.20.1.dist-info", "Cryptodome", "pycryptodomex-3.23.0.dist-info", "lz4", "lz4-4.4.5.dist-info", "jeepney", "jeepney-0.9.0.dist-info")) {
    $OldPath = Join-Path $PythonModulesDir $OldModule
    if (Test-Path $OldPath) { Remove-Item -LiteralPath $OldPath -Recurse -Force }
}

python (Join-Path $ScriptDir "scripts/patch_ytmusicapi.py")
if ($LASTEXITCODE -ne 0) { throw "ytmusicapi compatibility patch failed" }

# --- Step 2: Build frontend ---
Write-Host "`n[2/6] Building frontend..." -ForegroundColor Yellow
Push-Location $ScriptDir
pnpm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Pop-Location

# --- Step 3: Build backend ---
Write-Host "`n[3/6] Building backend..." -ForegroundColor Yellow
Push-Location $ScriptDir
pnpm run build:backend
if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
Pop-Location

# --- Step 4: Download Node.js binary (linux-x64) ---
Write-Host "`n[4/6] Downloading Node.js $NodeVersion (linux-x64)..." -ForegroundColor Yellow
if (!(Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir | Out-Null }

$NodeBin = Join-Path $BinDir "node"
python (Join-Path $ScriptDir "scripts/fetch_node_runtime.py") --version $NodeVersion --destination $NodeBin --cache (Join-Path $ScriptDir "outputs/runtime-cache") --windows-probe (Join-Path $ScriptDir "outputs/node-probe.exe")
if ($LASTEXITCODE -ne 0) { throw "Verified Node runtime download failed" }

# --- Step 5: Download yt-dlp binary (linux) ---
Write-Host "`n[5/6] Downloading yt-dlp (linux)..." -ForegroundColor Yellow
$YtdlpBin = Join-Path $BinDir "yt-dlp"
python (Join-Path $ScriptDir "scripts/fetch_ytdlp.py") --version $YtdlpVersion --destination $YtdlpBin
if ($LASTEXITCODE -ne 0) { throw "Verified yt-dlp download failed" }

python (Join-Path $ScriptDir "scripts/verify_audio_runtime.py") --root $ScriptDir --probe-node (Join-Path $ScriptDir "outputs/node-probe.exe")
if ($LASTEXITCODE -ne 0) { throw "Extractor and Node runtime are incompatible" }

# --- Step 6: Package into ZIP ---
Write-Host "`n[6/6] Packaging into $PluginName.zip..." -ForegroundColor Yellow

# Clean staging
if (Test-Path $StagingDir) { Remove-Item -Recurse -Force $StagingDir }
New-Item -ItemType Directory -Path $PluginDir | Out-Null

# Copy required files
Copy-Item (Join-Path $ScriptDir "dist") (Join-Path $PluginDir "dist") -Recurse
Copy-Item (Join-Path $ScriptDir "backend/out") (Join-Path $PluginDir "backend/out") -Recurse
Copy-Item (Join-Path $ScriptDir "backend/xml") (Join-Path $PluginDir "backend/xml") -Recurse
Copy-Item (Join-Path $ScriptDir "py_modules") (Join-Path $PluginDir "py_modules") -Recurse
Copy-Item $BinDir (Join-Path $PluginDir "bin") -Recurse
Copy-Item (Join-Path $ScriptDir "package.json") (Join-Path $PluginDir "package.json")
Copy-Item (Join-Path $ScriptDir "plugin.json") (Join-Path $PluginDir "plugin.json")
Copy-Item (Join-Path $ScriptDir "main.py") (Join-Path $PluginDir "main.py")
Copy-Item (Join-Path $ScriptDir "LICENSE") (Join-Path $PluginDir "LICENSE")

# Create a Linux-friendly ZIP. Compress-Archive drops Unix executable bits,
# which prevents SteamOS from starting the bundled Node and yt-dlp binaries.
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
python (Join-Path $ScriptDir "scripts/package_plugin.py") --source $PluginDir --output $ZipPath --name $PluginName
if ($LASTEXITCODE -ne 0) { throw "Plugin ZIP packaging failed" }

# Clean staging
Remove-Item -Recurse -Force $StagingDir

$ZipSize = (Get-Item $ZipPath).Length / 1MB
Write-Host "`n=== Build complete! ===" -ForegroundColor Green
Write-Host "Output: $ZipPath ($([math]::Round($ZipSize, 1)) MB)" -ForegroundColor Green
Write-Host "Install: Copy ZIP to Steam Deck and install via Decky developer options" -ForegroundColor Cyan
