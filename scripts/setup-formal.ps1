# Installs only into the checkout's ignored runtime; does not change system PATH.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'formal-env.ps1')

function Assert-FormalExit([string] $operation) {
    if ($LASTEXITCODE -ne 0) { throw "$operation failed with exit code $LASTEXITCODE" }
}

$downloadDir = Join-Path $formalRuntimeRoot 'downloads'
New-Item -ItemType Directory -Force $downloadDir | Out-Null
$elanExe = Join-Path $env:ELAN_HOME 'bin/elan.exe'
if (-not (Test-Path -LiteralPath $elanExe)) {
    $release = Invoke-RestMethod 'https://api.github.com/repos/leanprover/elan/releases/tags/v4.2.4'
    $asset = $release.assets | Where-Object name -eq 'elan-x86_64-pc-windows-msvc.zip'
    if (-not $asset -or -not $asset.digest.StartsWith('sha256:')) { throw 'Missing Elan release digest' }
    $archive = Join-Path $downloadDir 'elan.zip'
    Invoke-WebRequest $asset.browser_download_url -OutFile $archive
    $actualDigest = 'sha256:' + (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualDigest -ne $asset.digest) { throw 'Elan download digest mismatch' }
    $installerDir = Join-Path $downloadDir 'elan'
    Expand-Archive -LiteralPath $archive -DestinationPath $installerDir -Force
    & (Join-Path $installerDir 'elan-init.exe') -y --no-modify-path --default-toolchain none
    Assert-FormalExit 'Elan installation'
}

$formalProject = Join-Path $formalRepoRoot 'formal-verifier'
$toolchain = (Get-Content -LiteralPath (Join-Path $formalProject 'lean-toolchain') -Raw).Trim()
& $elanExe toolchain install $toolchain
Assert-FormalExit 'Pinned Lean installation'
& $elanExe default $toolchain
Assert-FormalExit 'Checkout-local default toolchain'
$venvPython = Join-Path $formalRuntimeRoot 'venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv (Join-Path $formalRuntimeRoot 'venv')
    Assert-FormalExit 'Python environment creation'
}
& $venvPython -m pip install --no-cache-dir --disable-pip-version-check -e "${formalRepoRoot}[dev]" -e "${formalProject}[dev]"
Assert-FormalExit 'Formal Python dependencies'
Push-Location $formalProject
try {
    # lake build resolves the committed lockfile. Do not replace it with latest dependencies.
    lake exe cache get
    Assert-FormalExit 'Pinned mathlib cache'
    lake build QuickMathsFormal
    Assert-FormalExit 'Lean corpus build'
} finally { Pop-Location }
Write-Host 'Ready. Dot-source scripts/formal-env.ps1 in new shells, then run qm-formal serve.'
