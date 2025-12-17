# Copy Oracle Instant Client libraries for Docker build
$sourceDir = "C:\oracle\product\19c\Client_x64\bin"
$destDir = "oracle_libs"

# Create destination directory
if (Test-Path $destDir) {
    Remove-Item $destDir -Recurse -Force
}
New-Item -ItemType Directory -Path $destDir | Out-Null

# Copy required DLLs (converted to .so naming for Linux)
$requiredFiles = @(
    "oci.dll",
    "oraociei19.dll",
    "oraons.dll",
    "ociw32.dll",
    "ocijdbc19.dll"
)

Write-Host "Copying Oracle Instant Client files from $sourceDir to $destDir..."

foreach ($file in $requiredFiles) {
    $sourcePath = Join-Path $sourceDir $file
    if (Test-Path $sourcePath) {
        Copy-Item $sourcePath -Destination $destDir
        Write-Host "✓ Copied $file"
    } else {
        Write-Host "⚠ Warning: $file not found" -ForegroundColor Yellow
    }
}

# Also copy any additional required files
Get-ChildItem $sourceDir -Filter "ora*.dll" | ForEach-Object {
    if ($_.Name -notin $requiredFiles) {
        Copy-Item $_.FullName -Destination $destDir
        Write-Host "✓ Copied $($_.Name)"
    }
}

Write-Host "`nOracle libraries prepared in $destDir directory" -ForegroundColor Green
Write-Host "You can now run: docker-compose build" -ForegroundColor Cyan
