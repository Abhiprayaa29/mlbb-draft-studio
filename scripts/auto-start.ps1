# ---------------------------------------------------------------------------
# MLBB Draft Studio - auto-start backend (5174) + Vite (5173)
# Dijalankan Task Scheduler saat login (lihat README "Auto-start").
# Aman dijalankan berulang: proses yang sudah hidup tidak diduplikasi.
# ---------------------------------------------------------------------------
$Project = 'D:\Data\Documents\mlbb-draft-studio'
$LogFile = Join-Path $Project 'scripts\report\auto-start.log'
$BackendPort = 5174
$VitePort = 5173

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-Port($port) {
  try {
    $c = Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue -InformationLevel Quiet
    return $c
  } catch { return $false }
}

# pastikan folder log ada
New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null

Log "=== auto-start dimulai ==="

# 1. Backend
if (Test-Port $BackendPort) {
  Log "backend :$BackendPort sudah hidup - dilewati"
} else {
  Start-Process -FilePath 'node' -ArgumentList 'server\index.js' -WorkingDirectory $Project `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $Project 'scripts\report\backend-out.log') `
    -RedirectStandardError  (Join-Path $Project 'scripts\report\backend-err.log')
  Log "backend dimulai (node server\index.js)"
}

# 2. Vite dev server
if (Test-Port $VitePort) {
  Log "vite    :$VitePort sudah hidup - dilewati"
} else {
  $vite = Join-Path $Project 'node_modules\vite\bin\vite.js'
  if (Test-Path $vite) {
    Start-Process -FilePath 'node' -ArgumentList $vite, '--port', $VitePort -WorkingDirectory $Project `
      -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $Project 'scripts\report\vite-out.log') `
      -RedirectStandardError  (Join-Path $Project 'scripts\report\vite-err.log')
    Log "vite dimulai (port $VitePort)"
  } else {
    Log "vite TIDAK ditemukan ($vite) - jalankan npm install dulu"
  }
}

# 3. Tunggu siap (maks 20 detik)
$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  if ((Test-Port $BackendPort) -and (Test-Port $VitePort)) { break }
  Start-Sleep -Milliseconds 500
}

$okB = Test-Port $BackendPort
$okV = Test-Port $VitePort
Log ("hasil  : backend {0} | vite {1}" -f $(if ($okB) { 'OK' } else { 'GAGAL' }), $(if ($okV) { 'OK' } else { 'GAGAL' }))
Log "=== auto-start selesai ==="
