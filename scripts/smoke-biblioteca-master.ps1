# Valida deploy da Biblioteca Master (API serviço `api` + painel).
# Uso: .\scripts\smoke-biblioteca-master.ps1

$ErrorActionPreference = "Stop"
$ApiBase = if ($env:SMOKE_API_BASE) { $env:SMOKE_API_BASE } else { "https://app.chattypebot.com" }
$PainelBase = if ($env:SMOKE_PAINEL_BASE) { $env:SMOKE_PAINEL_BASE } else { "https://painel.chattypebot.com" }

$ExpectedApiMarker = "DEPLOY-2026-06-03-api-biblioteca-walkup-only"
$ExpectedLibraryLogic = "walkup-live-only-v2"
$ExpectedAdminMarker = "DEPLOY-2026-06-03-admin-biblioteca-walkup-only"

Write-Host "=== Smoke Biblioteca Master ===" -ForegroundColor Cyan
Write-Host "API: $ApiBase"
Write-Host "Painel: $PainelBase"
Write-Host ""

$fail = 0

try {
  $health = Invoke-RestMethod -Uri "$ApiBase/health"
  Write-Host "[API health] deployMarker: $($health.deployMarker)"
  Write-Host "[API health] masterLibraryLogicVersion: $($health.masterLibraryLogicVersion)"
  Write-Host "[API health] typebotBuilderReachable: $($health.typebotBuilderReachable)"

  if ($health.deployMarker -ne $ExpectedApiMarker) {
    Write-Host "FALHA: API ainda no marker antigo. Redeploy servico api no Easypanel." -ForegroundColor Red
    $fail++
  } else {
    Write-Host "OK: API marker" -ForegroundColor Green
  }

  if ($health.masterLibraryLogicVersion -ne $ExpectedLibraryLogic) {
    Write-Host "FALHA: masterLibraryLogicVersion inesperada." -ForegroundColor Red
    $fail++
  } else {
    Write-Host "OK: logica Biblioteca Master na API" -ForegroundColor Green
  }
} catch {
  Write-Host "FALHA: nao foi possivel ler $ApiBase/health - $($_.Exception.Message)" -ForegroundColor Red
  $fail++
}

try {
  $flows = Invoke-RestMethod -Uri "$ApiBase/api/master/system-library/source-flows"
  $count = @($flows).Count
  Write-Host "[source-flows] count: $count"
  foreach ($flow in @($flows)) {
    $url = [string]$flow.url
    if ($url -match "soma-typebot") {
      Write-Host "FALHA: fluxo soma-typebot ainda retornado: $url" -ForegroundColor Red
      $fail++
    }
    if (-not $flow.typebotRemoteId) {
      Write-Host "FALHA: fluxo sem typebotRemoteId: $url" -ForegroundColor Red
      $fail++
    }
  }
  if ($count -le 1 -and $fail -eq 0) {
    Write-Host "OK: source-flows sem lixo multi-tenant" -ForegroundColor Green
  }
} catch {
  Write-Host "FALHA: source-flows — $($_.Exception.Message)" -ForegroundColor Red
  $fail++
}

try {
  $html = (Invoke-WebRequest -Uri $PainelBase -UseBasicParsing).Content
  if ($html -notmatch 'src="(/assets/index-[^"]+\.js)"') {
    throw "bundle JS nao encontrado no HTML"
  }
  $jsUrl = "$PainelBase$($Matches[1])"
  $bundle = (Invoke-WebRequest -Uri $jsUrl -UseBasicParsing).Content
  if ($bundle.Contains($ExpectedAdminMarker)) {
    Write-Host "OK: painel com build marker $ExpectedAdminMarker" -ForegroundColor Green
  } else {
    Write-Host "FALHA: painel sem marker $ExpectedAdminMarker. Redeploy servico painel." -ForegroundColor Red
    $fail++
  }
} catch {
  Write-Host "FALHA: painel — $($_.Exception.Message)" -ForegroundColor Red
  $fail++
}

Write-Host ""
if ($fail -gt 0) {
  Write-Host "RESULTADO: $fail falha(s). Corrija redeploy api + painel e rode de novo." -ForegroundColor Red
  exit 1
}

Write-Host "RESULTADO: OK — Biblioteca Master deploy validado." -ForegroundColor Green
exit 0
