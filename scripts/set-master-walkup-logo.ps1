# Aplica a logo Walkup no assinante matriz via API (produção ou local).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\set-master-walkup-logo.ps1

param(
  [string]$ApiBase = "https://app.chattypebot.com",
  [string]$LogoPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $LogoPath) {
  $LogoPath = Join-Path $PSScriptRoot "..\apps\api\assets\logo-walkup.png"
}
if (-not (Test-Path $LogoPath)) {
  $LogoPath = Join-Path $PSScriptRoot "..\LOGO WALKUP.png"
}
if (-not (Test-Path $LogoPath)) {
  throw "Logo não encontrada: defina -LogoPath ou coloque LOGO WALKUP.png na raiz do projeto."
}

$bytes = [IO.File]::ReadAllBytes($LogoPath)
$b64 = [Convert]::ToBase64String($bytes)
$dataUrl = "data:image/png;base64,$b64"

Write-Host "API: $ApiBase"
Write-Host "Logo: $LogoPath ($($bytes.Length) bytes)"

$tenants = Invoke-RestMethod -Uri "$ApiBase/api/master/tenants" -Method Get
$master = $tenants | Where-Object { $_.ownerEmail -eq "walkup@walkuptec.com.br" } | Select-Object -First 1
if (-not $master) {
  throw "Tenant matriz walkup@walkuptec.com.br não encontrado."
}

Write-Host "Tenant: $($master.name) ($($master.id))"

$body = @{ profileImageUrl = $dataUrl } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri "$ApiBase/api/master/tenants/$($master.id)/profile-image" -Method Patch -ContentType "application/json" -Body $body | Out-Null

Write-Host "OK - profileImageUrl atualizado no assinante matriz." -ForegroundColor Green
