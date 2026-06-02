# Diagnóstico rápido — URLs Typebot (builder/viewer)
# Uso: powershell -File scripts/diagnose-typebot-access.ps1

$ErrorActionPreference = "Continue"

$targets = @(
  @{ Name = "Builder (correto)"; Url = "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin" },
  @{ Name = "Builder (antigo walkup)"; Url = "https://typebot-walkup-builder.achpyp.easypanel.host/signin" },
  @{ Name = "Builder (antigo soma)"; Url = "https://soma-typebot-walkup-builder.achpyp.easypanel.host/signin" },
  @{ Name = "Viewer (correto)"; Url = "https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/" },
  @{ Name = "API health"; Url = "https://app.chattypebot.com/health" }
)

Write-Host "`n=== Diagnóstico Typebot ===`n" -ForegroundColor Cyan

foreach ($t in $targets) {
  try {
    $response = Invoke-WebRequest -Uri $t.Url -Method Head -MaximumRedirection 0 -TimeoutSec 15 -UseBasicParsing
    $code = [int]$response.StatusCode
    $color = if ($code -ge 500) { "Red" } elseif ($code -ge 400) { "Yellow" } else { "Green" }
    Write-Host ("{0,-28} {1} -> HTTP {2}" -f $t.Name, $t.Url, $code) -ForegroundColor $color
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    if (-not $code) { $code = "erro/timeout" }
    Write-Host ("{0,-28} {1} -> HTTP {2}" -f $t.Name, $t.Url, $code) -ForegroundColor Red
  }
}

Write-Host "`n502 no builder = reiniciar typebot-walkup-builder no Easypanel (PORT=3000, HOSTNAME=0.0.0.0).`n" -ForegroundColor Gray
Write-Host "Guia: doc/TYPEBOT-ACESSO-E-502-HOJE.md`n" -ForegroundColor Gray
