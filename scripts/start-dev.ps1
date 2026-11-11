<#
.SYNOPSIS
Launch EDI NEXUS in developer mode (FastAPI backend :8000 + Vite frontend :5173).
#>
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendDir = Join-Path $RepoRoot "backend"
$PythonExe = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonExe)) {
    throw "Backend virtualenv not found at $PythonExe."
}

Write-Host "Starting FastAPI backend (http://127.0.0.1:8000) and Vite dev server (http://localhost:5173)..."
$be = Start-Process -FilePath $PythonExe -ArgumentList "-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000","--reload" -WorkingDirectory $BackendDir -PassThru
$fe = Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev -- --host localhost --port 5173 --strictPort" -WorkingDirectory $FrontendDir -PassThru

try {
    Write-Host "Both servers running. Press Ctrl+C or close window to stop."
    while (-not $be.HasExited -and -not $fe.HasExited) {
        Start-Sleep -Seconds 1
    }
} finally {
    if ($be -and -not $be.HasExited) { Stop-Process -Id $be.Id -Force -ErrorAction SilentlyContinue }
    if ($fe -and -not $fe.HasExited) { Stop-Process -Id $fe.Id -Force -ErrorAction SilentlyContinue }
}

