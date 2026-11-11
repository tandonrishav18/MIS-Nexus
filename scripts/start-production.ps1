<#
.SYNOPSIS
Launch EDI NEXUS in single-origin local production mode on http://127.0.0.1:8000.
#>
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendDir = Join-Path $RepoRoot "backend"
$PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "Backend virtualenv not found at $PythonExe. Run Python venv setup first."
}

$DistIndex = Join-Path $FrontendDir "dist\index.html"
if (-not (Test-Path $DistIndex)) {
    Write-Host "Building frontend production bundle..."
    Push-Location $FrontendDir
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
    } finally {
        Pop-Location
    }
}

Write-Host "Starting EDI NEXUS single-origin server on http://127.0.0.1:8000 ..."
Push-Location $BackendDir
try {
    & $PythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
} finally {
    Pop-Location
}

