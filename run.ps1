#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Set up and run the Myntra-Clone full stack for local development.

.DESCRIPTION
    Boots all four pieces: the FastAPI backend, the RQ notification worker,
    the Next.js web client, and the Expo mobile client. The first run installs
    everything (Python venv + pip, npm) and seeds the database; later runs
    reuse what's already there. Each long-running service opens in its own
    window so you can read its logs and stop it independently.

.PARAMETER SetupOnly
    Install dependencies and seed the DB, but don't start any servers.

.PARAMETER NoWorker
    Skip the RQ notification worker (use if you don't have Redis running).

.PARAMETER NoWeb
    Skip the Next.js web client.

.PARAMETER NoMobile
    Skip the Expo mobile client.

.EXAMPLE
    ./run.ps1
    ./run.ps1 -NoMobile -NoWorker
    ./run.ps1 -SetupOnly
#>
param(
    [switch]$SetupOnly,
    [switch]$NoWorker,
    [switch]$NoWeb,
    [switch]$NoMobile
)

$ErrorActionPreference = "Stop"
$Root    = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Web     = Join-Path $Root "web"
$Mobile  = Join-Path $Root "mobile"

function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "!!  $m" -ForegroundColor Yellow }

# ---- prerequisites ----
foreach ($cmd in @("python", "node", "npm")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "$cmd is not installed or not on PATH."
    }
}

# ---- backend: venv + deps + env + seed ----
$VenvPy = Join-Path $Backend ".venv\Scripts\python.exe"
$VenvRq = Join-Path $Backend ".venv\Scripts\rq.exe"
if (-not (Test-Path $VenvPy)) {
    Info "Creating backend virtualenv"
    python -m venv (Join-Path $Backend ".venv")
}
Info "Installing backend dependencies"
& $VenvPy -m pip install --quiet --upgrade pip
& $VenvPy -m pip install --quiet -r (Join-Path $Backend "requirements-dev.txt")

$BackendEnv = Join-Path $Backend ".env"
if (-not (Test-Path $BackendEnv)) {
    Copy-Item (Join-Path $Backend ".env.example") $BackendEnv
    Info "Created backend/.env from .env.example"
}
Info "Seeding database"
Push-Location $Backend
try { & $VenvPy -m app.seed } finally { Pop-Location }

# ---- web: deps + env ----
if (-not $NoWeb) {
    if (-not (Test-Path (Join-Path $Web "node_modules"))) {
        Info "Installing web dependencies (npm install)"
        Push-Location $Web; try { npm install } finally { Pop-Location }
    }
    $WebEnv = Join-Path $Web ".env.local"
    $WebEnvExample = Join-Path $Web ".env.example"
    if ((-not (Test-Path $WebEnv)) -and (Test-Path $WebEnvExample)) {
        Copy-Item $WebEnvExample $WebEnv
        Info "Created web/.env.local from .env.example"
    }
}

# ---- mobile: deps ----
if (-not $NoMobile) {
    if (-not (Test-Path (Join-Path $Mobile "node_modules"))) {
        Info "Installing mobile dependencies (npm install)"
        Push-Location $Mobile; try { npm install } finally { Pop-Location }
    }
}

# ---- redis check (worker + push notifications need it) ----
if (-not $NoWorker) {
    $redisOk = $false
    if (Get-Command redis-cli -ErrorAction SilentlyContinue) {
        try { if ((redis-cli ping 2>$null) -match "PONG") { $redisOk = $true } } catch {}
    }
    if (-not $redisOk) {
        Warn "Redis not reachable. The RQ worker and push notifications need Redis at redis://localhost:6379."
        Warn "Start Redis (redis-server, or 'docker run -p 6379:6379 redis') or re-run with -NoWorker."
    }
}

if ($SetupOnly) { Info "Setup complete (-SetupOnly)."; return }

# ---- launch each service in its own window ----
function Start-Svc($title, $workdir, $command) {
    Info "Starting $title"
    Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit", "-Command",
        "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$workdir'; $command"
    )
}

Start-Svc "API (uvicorn :8000)" $Backend "& '$VenvPy' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
if (-not $NoWorker) { Start-Svc "RQ worker"      $Backend "& '$VenvRq' worker notifications" }
if (-not $NoWeb)    { Start-Svc "Web (:3000)"    $Web     "npm run dev" }
if (-not $NoMobile) { Start-Svc "Mobile (Expo)"  $Mobile  "npm start" }

Write-Host ""
Info "All services launched in separate windows."
Write-Host "  API:    http://localhost:8000   (docs: http://localhost:8000/docs)"
if (-not $NoWeb)    { Write-Host "  Web:    http://localhost:3000" }
if (-not $NoMobile) { Write-Host "  Mobile: Expo dev server (scan the QR in the Mobile window)" }
Write-Host "Close each window (or Ctrl-C inside it) to stop that service."
