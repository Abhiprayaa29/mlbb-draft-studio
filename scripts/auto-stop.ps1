# ---------------------------------------------------------------------------
# MLBB Draft Studio — hentikan backend (5174) & Vite (5173)
# Jalankan manual bila ingin mematikan server tanpa Task Manager.
# ---------------------------------------------------------------------------
$ports = 5174, 5173
foreach ($p in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
  foreach ($c in $conns) {
    try {
      Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
      Write-Output "port $p : proses $($c.OwningProcess) dihentikan"
    } catch {
      Write-Output "port $p : gagal menghentikan proses $($c.OwningProcess)"
    }
  }
  if (-not $conns) { Write-Output "port $p : tidak ada proses" }
}
