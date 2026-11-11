<#
.SYNOPSIS
Run full EDI NEXUS automated backend test suite, TypeScript check, and production build.
#>
$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$FrontendDir = Join-Path $RepoRoot "frontend"
$BackendDir = Join-Path $RepoRoot "backend"
$PytestExe = Join-Path $BackendDir ".venv\Scripts\pytest.exe"

Write-Host "=== 1/3 Running Backend Pytest Suite ==="
Push-Location $BackendDir
try {
    & $PytestExe -v
    if ($LASTEXITCODE -ne 0) { throw "Backend pytest suite failed." }
} finally {
    Pop-Location
}

Write-Host "=== 2/3 Running Frontend TypeScript Check ==="
Push-Location $FrontendDir
try {
    npm run lint
    if ($LASTEXITCODE -ne 0) { throw "Frontend TypeScript check failed." }

    Write-Host "=== 3/3 Running Vite Production Build ==="
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Vite production build failed." }
} finally {
    Pop-Location
}

Write-Host "ALL CHECKS PASSED CLEANLY."

