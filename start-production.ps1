# Build and start AQ Monitor application
$ErrorActionPreference = "Stop"

Write-Host "Building Backend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\backend"
npm run build

Write-Host "`nBuilding Frontend..." -ForegroundColor Cyan
Set-Location "$PSScriptRoot\frontend"
npm run build

Write-Host "`nStarting Backend..." -ForegroundColor Green
Set-Location "$PSScriptRoot\backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node dist/server.js"

Write-Host "`nStarting Frontend..." -ForegroundColor Green
Set-Location "$PSScriptRoot\frontend\dist"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npx serve -s . -p 8080"

Write-Host "`n✓ Application started!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:8080/aq-monitor/" -ForegroundColor Yellow
Write-Host "Backend API: http://localhost:4001/aq-monitor/api/" -ForegroundColor Yellow
