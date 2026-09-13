# Dot-source from PowerShell before using Lake or the formal companion.
$formalRepoRoot = Split-Path -Parent $PSScriptRoot
$formalRuntimeRoot = Join-Path $formalRepoRoot '.bridge-runtime/formal'
New-Item -ItemType Directory -Force (Join-Path $formalRuntimeRoot 'tmp') | Out-Null
$env:ELAN_HOME = Join-Path $formalRuntimeRoot 'elan'
$env:MATHLIB_CACHE_DIR = Join-Path $formalRuntimeRoot 'mathlib-cache'
$env:TEMP = Join-Path $formalRuntimeRoot 'tmp'
$env:TMP = $env:TEMP
$env:TMPDIR = $env:TEMP
$env:PYTHONUTF8 = '1'
$env:PATH = "$(Join-Path $formalRuntimeRoot 'venv/Scripts');$(Join-Path $env:ELAN_HOME 'bin');$env:PATH"
