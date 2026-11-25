$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$webDir = Join-Path $repoRoot "apps\web-ui"
$desktopDir = Join-Path $repoRoot "apps\desktop"

# Configure Rust self-contained GNU linker + WinLibs tools if present
$rustSelf = Join-Path $env:USERPROFILE ".rustup\toolchains\stable-x86_64-pc-windows-gnu\lib\rustlib\x86_64-pc-windows-gnu\bin\self-contained"
if (Test-Path (Join-Path $rustSelf "x86_64-w64-mingw32-gcc.exe")) {
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER = Join-Path $rustSelf "x86_64-w64-mingw32-gcc.exe"
}

$mingw = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Directory -Filter "BrechtSanders.WinLibs*" -ErrorAction SilentlyContinue | Select-Object -First 1
$mingwBin = if ($mingw) { Join-Path $mingw.FullName "mingw64\bin" } else { "" }
$env:Path = "$env:USERPROFILE\.cargo\bin;$mingwBin;$env:Path"

# GNU windres splits include paths containing spaces; use 8.3 short path for CARGO_TARGET_DIR
$targetDir = Join-Path $desktopDir "src-tauri\target"
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
$fso = New-Object -ComObject Scripting.FileSystemObject
$env:CARGO_TARGET_DIR = $fso.GetFolder($targetDir).ShortPath

Write-Host "==> 1/3 Building PulseBay frontend bundle..."
npm.cmd run build --prefix $webDir

Write-Host "==> 2/3 Building Rust desktop binary & Windows NSIS installer..."
Push-Location $desktopDir
try {
    npx.cmd tauri build --bundles nsis
} finally {
    Pop-Location
}

Write-Host "==> 3/3 Generating SHA-256 checksums..."
& (Join-Path $PSScriptRoot "generate-checksums.ps1")
