$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $repoRoot "apps\desktop\src-tauri\target\release"
$nsisDir = Join-Path $releaseDir "bundle\nsis"
$outDir = Join-Path $repoRoot "release-artifacts"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$files = @()
if (Test-Path $nsisDir) {
    $files += Get-ChildItem -Path $nsisDir -Filter "*.exe" -File
}
$portableExe = Join-Path $releaseDir "pulsebay-desktop.exe"
if (Test-Path $portableExe) {
    $files += Get-Item $portableExe
}

if ($files.Count -eq 0) {
    Write-Error "No release binaries found. Run 'npm run tauri:build' in apps/desktop first."
    exit 1
}

$lines = @()
foreach ($f in $files) {
    $dest = Join-Path $outDir $f.Name
    Copy-Item -Path $f.FullName -Destination $dest -Force
    $hash = (Get-FileHash -Path $dest -Algorithm SHA256).Hash.ToLowerInvariant()
    $lines += "$hash  $($f.Name)"
}

$sumsPath = Join-Path $outDir "SHA256SUMS.txt"
Set-Content -Path $sumsPath -Value ($lines -join "`n") -Encoding ascii
Write-Host "Wrote SHA-256 checksums to $sumsPath"
Get-Content $sumsPath
