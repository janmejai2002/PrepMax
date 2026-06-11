# resume-fresh.ps1
# Opens a NEW terminal window in the project root and starts a fresh Claude Code
# session running /resume. Used to hand off at a clean, committed breakpoint so the
# next chat rebuilds context cheaply from docs/STATE.md instead of re-sending a long
# history. Only meaningful AFTER a /wrap (tests pass, STATE.md updated, pushed).
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\resume-fresh.ps1

$projectRoot = Split-Path -Parent $PSScriptRoot
$inner = "Set-Location -LiteralPath '$projectRoot'; claude '/resume'"

# Prefer Windows Terminal if present; otherwise a standalone PowerShell window.
$wt = Get-Command wt.exe -ErrorAction SilentlyContinue
if ($wt) {
  Start-Process wt.exe -ArgumentList @('-d', $projectRoot, 'powershell', '-NoExit', '-Command', $inner)
} else {
  Start-Process powershell.exe -ArgumentList @('-NoExit', '-Command', $inner)
}

Write-Host "Opened a fresh Claude /resume session in a new terminal ($projectRoot)."
