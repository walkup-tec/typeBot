# Diagnóstico rápido — Typebot / MinIO no Easypanel
# Uso: powershell -ExecutionPolicy Bypass -File scripts\test-typebot-easypanel.ps1

$ErrorActionPreference = "Continue"

$targets = @(
    @{ Name = "MinIO";           Url = "https://typebot-minio.achpyp.easypanel.host/" }
    @{ Name = "Builder";         Url = "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/" }
    @{ Name = "Viewer";          Url = "https://typebot-typebot-walkup-viewer.achpyp.easypanel.host/" }
    @{ Name = "Builder /signin"; Url = "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/signin" }
    @{ Name = "Builder /api/health"; Url = "https://typebot-typebot-walkup-builder.achpyp.easypanel.host/api/health" }
)

Write-Host "`n========== DNS ==========" -ForegroundColor Yellow
$hosts = $targets.Url | ForEach-Object { ([uri]$_).Host } | Select-Object -Unique
foreach ($h in $hosts) {
    try {
        $ips = (Resolve-DnsName $h -Type A -ErrorAction Stop).IPAddress -join ", "
        Write-Host "OK  $h -> $ips"
    } catch {
        Write-Host "FAIL $h -> $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n========== HTTP (curl) ==========" -ForegroundColor Yellow
foreach ($t in $targets) {
    Write-Host "`n--- $($t.Name) ---"
    Write-Host "    $($t.Url)"
    $out = curl.exe -sS -o NUL -w "code=%{http_code} time=%{time_total}s`n" --max-time 20 -L $t.Url 2>&1
    Write-Host "    $out"
    if ($out -match "code=502") {
        $snippet = (curl.exe -sS --max-time 10 $t.Url 2>&1) -join ""
        if ($snippet -match "Service is not reachable") {
            Write-Host "    => Easypanel: container parado ou porta do dominio errada" -ForegroundColor Red
        }
    }
}

Write-Host "`n========== Resumo esperado ==========" -ForegroundColor Yellow
Write-Host "Builder: 200 ou 307"
Write-Host "Viewer:  200 ou 307 (se 502 -> PORT=3000 HOSTNAME=0.0.0.0 no viewer)"
Write-Host "MinIO:   200 login (se 502 -> serviço minio parado ou domínio na porta errada 9000/9001)"
Write-Host ""
