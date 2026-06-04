# Importa um typebot para o workspace Drax Sistemas no builder self-hosted.
# Uso:
#   $env:TYPEBOT_TOKEN = "seu_token"
#   powershell -ExecutionPolicy Bypass -File scripts\import-typebot-fluxo-para-drax.ps1

param(
  [string]$Token = $env:TYPEBOT_TOKEN,
  [string]$BuilderApi = "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/api",
  [string]$DraxWorkspaceId = "cmohgh7ll0014ru1cwhg90xnp",
  [string]$DesiredPublicId = "drax-sistemas-d3hpop9",
  [string]$FlowName = "Drax Sistemas",
  [string]$SourceTypebotId = "cmopzmivk0025ru1czpx5k4a3",
  [string]$SaasApi = "https://app.chattypebot.com",
  [string]$DraxTenantId = "3fd073ba-7a9a-482c-9714-bbf6f1ed4e8b"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()

if (-not $Token) {
  Write-Host "Defina TYPEBOT_TOKEN ou -Token" -ForegroundColor Red
  exit 1
}

$headers = @{
  Authorization = "Bearer $Token"
  "Content-Type" = "application/json"
  Accept         = "application/json"
}

function Get-TypebotDetail($TypebotId) {
  $url = "$BuilderApi/v1/typebots/$([uri]::EscapeDataString($TypebotId))?migrateToLatestVersion=true"
  try {
    $r = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 60
    return $r.typebot
  } catch {
    return $null
  }
}

function Find-TypebotIdByPublicId($PublicId) {
  $ws = Invoke-RestMethod -Uri "$BuilderApi/v1/workspaces" -Headers $headers -Method Get
  foreach ($w in $ws.workspaces) {
    $listUrl = "$BuilderApi/v1/typebots?workspaceId=$([uri]::EscapeDataString($w.id))&limit=200"
    $payload = Invoke-RestMethod -Uri $listUrl -Headers $headers -Method Get
    $bots = @()
    if ($payload.typebots) { $bots = $payload.typebots }
    foreach ($b in $bots) {
      $pid = $b.publicId
      if (-not $pid -and $b.id) {
        $d = Get-TypebotDetail $b.id
        if ($d) { $pid = $d.publicId }
      }
      if ($pid -eq $PublicId) {
        Write-Host "Encontrado em workspace '$($w.name)' ($($w.id))" -ForegroundColor Green
        return $b.id
      }
    }
  }
  return $null
}

Write-Host "1) Buscando typebot fonte..." -ForegroundColor Cyan
$schema = Get-TypebotDetail $SourceTypebotId
if (-not $schema) {
  Write-Host "   ID $SourceTypebotId nao encontrado; buscando publicId $DesiredPublicId ..." -ForegroundColor Yellow
  $foundId = Find-TypebotIdByPublicId $DesiredPublicId
  if (-not $foundId) {
    Write-Host "ERRO: fluxo nao existe em nenhum workspace. So resta export JSON do Typebot ou recriar no builder." -ForegroundColor Red
    exit 1
  }
  $SourceTypebotId = $foundId
  $schema = Get-TypebotDetail $SourceTypebotId
}

if (-not $schema) {
  Write-Host "ERRO: nao foi possivel ler o schema do typebot." -ForegroundColor Red
  exit 1
}

$schema.PSObject.Properties.Remove("id") | Out-Null
$schema.name = $FlowName

Write-Host "2) Importando para Drax ($DraxWorkspaceId)..." -ForegroundColor Cyan
$importBody = @{
  workspaceId = $DraxWorkspaceId
  typebot     = $schema
} | ConvertTo-Json -Depth 100 -Compress

$importResp = Invoke-RestMethod -Uri "$BuilderApi/v1/typebots/import" -Headers $headers -Method Post -Body $importBody -TimeoutSec 120
$newId = $importResp.typebot.id
if (-not $newId) { $newId = $importResp.id }
if (-not $newId) {
  Write-Host "ERRO: import sem ID retornado." -ForegroundColor Red
  $importResp | ConvertTo-Json -Depth 5
  exit 1
}
Write-Host "   Novo ID: $newId" -ForegroundColor Green

Write-Host "3) Ajustando publicId para $DesiredPublicId ..." -ForegroundColor Cyan
$patchBody = @{ typebot = @{ publicId = $DesiredPublicId; name = $FlowName } } | ConvertTo-Json -Depth 20 -Compress
Invoke-RestMethod -Uri "$BuilderApi/v1/typebots/$newId" -Headers $headers -Method Patch -Body $patchBody -TimeoutSec 60 | Out-Null

Write-Host "4) Publicando..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$BuilderApi/v1/typebots/$newId/publish" -Headers $headers -Method Post -TimeoutSec 60 | Out-Null
} catch {
  Write-Host "   publish endpoint falhou; tentando PATCH published=true" -ForegroundColor Yellow
  $pubPatch = @{ published = $true } | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "$BuilderApi/v1/typebots/$newId" -Headers $headers -Method Patch -Body $pubPatch | Out-Null
}

$viewerUrl = "https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/$DesiredPublicId"
Write-Host ""
Write-Host "OK - fluxo no workspace Drax." -ForegroundColor Green
Write-Host "Viewer: $viewerUrl"
Write-Host "Confira no builder: workspace Drax Sistemas"

Write-Host ""
Write-Host "5) Opcional: atualizar lista no painel SaaS..." -ForegroundColor Cyan
try {
  Invoke-RestMethod -Uri "$SaasApi/api/master/tenants/$DraxTenantId/typebot/recover-workspace-flows" -Method Post -TimeoutSec 120 | Out-Null
  Invoke-RestMethod -Uri "$SaasApi/api/master/tenants/$DraxTenantId/flows/sync-workspace" -Method Post -TimeoutSec 120 | Out-Null
  Write-Host "   sync-workspace OK" -ForegroundColor Green
} catch {
  Write-Host "   sync-workspace falhou - rode Atualizar lista no painel" -ForegroundColor Yellow
}
