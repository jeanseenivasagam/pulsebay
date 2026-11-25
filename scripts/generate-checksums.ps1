$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$releaseDir = Join-Path $repoRoot "apps\desktop\src-tauri\target\release"
$nsisDir = Join-Path $releaseDir "bundle\nsis"
$outDir = Join-Path $repoRoot "release-artifacts"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$filesToHash = @()

if (Test-Path $nsisDir) {
    foreach ($installer in (Get-ChildItem -Path $nsisDir -Filter "*.exe" -File)) {
        $dest = Join-Path $outDir $installer.Name
        Copy-Item -Path $installer.FullName -Destination $dest -Force
        $filesToHash += Get-Item $dest
    }
}

$portableExe = Join-Path $releaseDir "pulsebay-desktop.exe"
$webviewDll = Join-Path $releaseDir "WebView2Loader.dll"

if (Test-Path $portableExe) {
    $destExe = Join-Path $outDir "pulsebay-desktop.exe"
    Copy-Item -Path $portableExe -Destination $destExe -Force
    $filesToHash += Get-Item $destExe

    if (Test-Path $webviewDll) {
        $destDll = Join-Path $outDir "WebView2Loader.dll"
        Copy-Item -Path $webviewDll -Destination $destDll -Force
        $filesToHash += Get-Item $destDll

        # Package portable ZIP containing both pulsebay-desktop.exe and WebView2Loader.dll
        $portableZip = Join-Path $outDir "PulseBay_0.1.0_x64-portable.zip"
        if (Test-Path $portableZip) {
            Remove-Item -Path $portableZip -Force
        }
        Compress-Archive -Path @($destExe, $destDll) -DestinationPath $portableZip -CompressionLevel Optimal
        $filesToHash += Get-Item $portableZip
    }
}

if ($filesToHash.Count -eq 0) {
    Write-Error "No release binaries found. Run 'npm run tauri:build' in apps/desktop first."
    exit 1
}

$lines = @()
foreach ($f in $filesToHash) {
    $hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $lines += "$hash  $($f.Name)"
}

$sumsPath = Join-Path $outDir "SHA256SUMS.txt"
Set-Content -Path $sumsPath -Value ($lines -join "`n") -Encoding ascii
Write-Host "Wrote SHA-256 checksums to $sumsPath"
Get-Content $sumsPath
